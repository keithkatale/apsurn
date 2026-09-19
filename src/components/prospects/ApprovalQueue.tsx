"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, X, Pencil } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import type { ProspectRow } from "./types";

function fitLabel(score: number | null): { label: string; className: string } {
  if (score == null) return { label: "—", className: "text-neutral-400" };
  if (score >= 0.75) return { label: `${Math.round(score * 100)}% fit`, className: "text-emerald-700" };
  if (score >= 0.5) return { label: `${Math.round(score * 100)}% fit`, className: "text-amber-700" };
  return { label: `${Math.round(score * 100)}% fit`, className: "text-neutral-500" };
}

function confidenceLabel(score: number | null): string {
  if (score == null) return "unknown confidence";
  if (score >= 0.8) return "high confidence";
  if (score >= 0.55) return "medium confidence";
  return "low confidence";
}

export function ApprovalQueue({ prospects, onChanged }: { prospects: ProspectRow[]; onChanged?: () => void }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftScore, setDraftScore] = useState("");
  const [draftReason, setDraftReason] = useState("");

  if (prospects.length === 0) return null;

  async function act(
    id: string,
    status: "qualified" | "rejected",
    correction?: { icpFitScore?: number; qualifyReason?: string }
  ) {
    setBusyId(id);
    try {
      await fetch("/api/prospect-companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds: [id], status, ...correction }),
      });
      if (onChanged) onChanged();
      else router.refresh();
    } finally {
      setBusyId(null);
      setEditingId(null);
    }
  }

  function startEdit(p: ProspectRow) {
    setEditingId(p.id);
    setDraftScore(p.icp_fit_score != null ? String(Math.round(p.icp_fit_score * 100)) : "");
    setDraftReason(p.qualify_reason ?? "");
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 bg-amber-50 px-3 py-2">
        <span className="text-sm font-medium text-neutral-900">Approval queue</span>
        <span className="ml-2 text-[12px] text-neutral-500">
          {prospects.length} pending — review before they join your CRM list
        </span>
      </div>

      <div className="divide-y divide-neutral-100">
        {prospects.map((p) => {
          const fit = fitLabel(p.icp_fit_score);
          const recommended = p.contacts.find((c) => c.id === p.recommended_contact_id) ?? p.contacts[0] ?? null;
          const isEditing = editingId === p.id;
          const isBusy = busyId === p.id;

          return (
            <div key={p.id} className="flex flex-col gap-2 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-neutral-900">{p.name}</span>
                  <span className="shrink-0 text-[12px] text-neutral-400">{p.domain}</span>
                  <span className={`shrink-0 text-[12px] font-medium ${fit.className}`}>{fit.label}</span>
                  <span className="shrink-0 text-[11px] text-neutral-400">{confidenceLabel(p.data_confidence)}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <ThreeDButton
                    type="button"
                    variant="soft"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => startEdit(p)}
                  >
                    <Pencil className="size-3.5" />
                    <span>Correct</span>
                  </ThreeDButton>
                  <ThreeDButton
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => act(p.id, "rejected")}
                  >
                    <X className="size-3.5" />
                    <span>Reject</span>
                  </ThreeDButton>
                  <ThreeDButton
                    type="button"
                    variant="solid"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => act(p.id, "qualified")}
                  >
                    <Check className="size-3.5" />
                    <span>Approve</span>
                  </ThreeDButton>
                </div>
              </div>

              {p.qualify_reason && !isEditing && (
                <p className="text-[13px] text-neutral-600">{p.qualify_reason}</p>
              )}

              {recommended && (
                <p className="text-[12px] text-neutral-500">
                  Recommended contact: <span className="font-medium text-neutral-700">{recommended.full_name}</span>
                  {recommended.title ? ` — ${recommended.title}` : ""}
                  {recommended.email ? ` · ${recommended.email}` : ""}
                </p>
              )}

              {p.evidence?.[0]?.url && (
                <a
                  href={p.evidence[0].url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-fit text-[12px] text-neutral-500 underline"
                >
                  Evidence source
                </a>
              )}

              {isEditing && (
                <div className="flex flex-wrap items-end gap-2 rounded border border-neutral-200 bg-neutral-50 p-2">
                  <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
                    Fit score (%)
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="input w-20"
                      value={draftScore}
                      onChange={(e) => setDraftScore(e.target.value)}
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 text-[11px] text-neutral-500">
                    Reason
                    <input
                      className="input"
                      value={draftReason}
                      onChange={(e) => setDraftReason(e.target.value)}
                    />
                  </label>
                  <ThreeDButton
                    type="button"
                    variant="soft"
                    size="sm"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </ThreeDButton>
                  <ThreeDButton
                    type="button"
                    variant="solid"
                    size="sm"
                    disabled={isBusy}
                    onClick={() =>
                      act(p.id, "qualified", {
                        icpFitScore: draftScore ? Math.min(Math.max(Number(draftScore) / 100, 0), 1) : undefined,
                        qualifyReason: draftReason || undefined,
                      })
                    }
                  >
                    Save & approve
                  </ThreeDButton>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
