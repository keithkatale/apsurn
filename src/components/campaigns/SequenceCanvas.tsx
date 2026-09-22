"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Loader2, Plus, Sparkles, Trash2, Zap } from "lucide-react";
import { ContactAvatar } from "@/components/prospects/ContactAvatar";
import { EmailComposeEditor } from "@/components/campaigns/EmailComposeEditor";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { canvasVisibleSteps, isOnboardingAutoFollowup, sortCampaignSteps } from "@/lib/campaigns/sequence-steps";
import { cn } from "@/lib/cn";
import { htmlToPlain } from "@/lib/outreach/email-html";
import type { CampaignEmailStep, CampaignLead } from "@/components/campaigns/CampaignWorkspace";

function EmailFieldSkeleton({ lines = 1 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2 py-1">
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className={cn("h-3 animate-pulse rounded bg-neutral-200", index === lines - 1 && lines > 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

function StepBadge({ index, delayDays }: { index: number; delayDays: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-600">
      {index === 0 ? (
        <>
          <Zap className="size-3 text-[#4379EE]" /> Sends immediately
        </>
      ) : (
        <>
          <Clock3 className="size-3" /> Waits {delayDays} day{delayDays === 1 ? "" : "s"}, if no reply
        </>
      )}
    </span>
  );
}

function ChainConnector() {
  return (
    <div className="flex flex-col items-center py-1" aria-hidden>
      <div className="h-6 w-px border-l border-dashed border-neutral-300" />
    </div>
  );
}

export function SequenceCanvas({
  campaignId,
  steps,
  onStepsChange,
  lead,
  senderName,
  inboxEmail,
  subject,
  body,
  onSubjectChange,
  onBodyChange,
  drafting,
  onRegenerateOpener,
  sending,
  sendMessage,
  onSend,
}: {
  campaignId: string;
  steps: CampaignEmailStep[];
  onStepsChange: (steps: CampaignEmailStep[]) => void;
  lead: CampaignLead | null;
  senderName: string;
  inboxEmail: string | null;
  subject: string;
  body: string;
  onSubjectChange: (v: string) => void;
  onBodyChange: (html: string) => void;
  drafting: boolean;
  onRegenerateOpener: () => void;
  sending: boolean;
  sendMessage: string | null;
  onSend: () => void;
}) {
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [addDelayDays, setAddDelayDays] = useState(3);
  const prunedRef = useRef(new Set<string>());

  const sorted = useMemo(() => sortCampaignSteps(steps), [steps]);
  const visible = useMemo(() => canvasVisibleSteps(steps), [steps]);
  const followups = visible.slice(1);

  useEffect(() => {
    if (prunedRef.current.has(campaignId)) return;
    const auto = sorted.slice(1).filter(isOnboardingAutoFollowup);
    prunedRef.current.add(campaignId);
    if (auto.length === 0) return;
    for (const step of auto) {
      void fetch(`/api/campaigns/${campaignId}/steps/${step.id}`, { method: "DELETE" });
    }
  }, [campaignId, sorted]);

  function patchStep(stepId: string, patch: { delayDays?: number; subject?: string | null; body?: string }) {
    onStepsChange(
      sorted.map((step) =>
        step.id === stepId
          ? {
              ...step,
              delayDays: patch.delayDays ?? step.delayDays,
              subject: patch.subject !== undefined ? patch.subject : step.subject,
              body: patch.body ?? step.body,
            }
          : step,
      ),
    );
    void fetch(`/api/campaigns/${campaignId}/steps/${stepId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(patch.delayDays !== undefined ? { delayDays: patch.delayDays } : {}),
        ...(patch.subject !== undefined ? { subjectTemplate: patch.subject } : {}),
        ...(patch.body !== undefined ? { bodyTemplate: patch.body } : {}),
      }),
    });
  }

  async function generateStep(stepId: string) {
    setGeneratingId(stepId);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/steps/${stepId}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not write this follow-up");
      onStepsChange(
        sorted.map((step) =>
          step.id === stepId ? { ...step, subject: String(data.subject ?? ""), body: String(data.body ?? "") } : step,
        ),
      );
    } catch {
      // user can retry
    } finally {
      setGeneratingId(null);
    }
  }

  async function deleteStep(stepId: string) {
    onStepsChange(sorted.filter((step) => step.id !== stepId));
    void fetch(`/api/campaigns/${campaignId}/steps/${stepId}`, { method: "DELETE" });
  }

  async function addStep(delayDays: number) {
    setAddBusy(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delayDays }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add step");
      const newStep: CampaignEmailStep = {
        id: data.id,
        stepOrder: data.stepOrder,
        delayDays: data.delayDays,
        subject: data.subject,
        body: data.body,
      };
      onStepsChange([...sorted, newStep]);
    } catch {
      // ignore
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div className="sequence-canvas h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-6">
        <article className="w-full rounded-lg border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-2.5">
            <StepBadge index={0} delayDays={0} />
            {lead && !drafting && (
              <button
                type="button"
                onClick={onRegenerateOpener}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#4379EE] hover:text-[#3567D6]"
              >
                <Sparkles className="size-3" /> Rewrite
              </button>
            )}
          </div>
          {lead ? (
            <>
              <div className="flex items-center justify-between border-b border-neutral-100 bg-[#F8F9FC] px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <ContactAvatar name={lead.fullName} linkedinUrl={lead.linkedinUrl} email={lead.email} className="size-10" />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-neutral-900">{lead.fullName || "Unknown"}</p>
                    <p className="truncate text-[12px] text-neutral-500">
                      {lead.title || "Role unknown"}
                      {lead.companyName ? ` · ${lead.companyName}` : ""}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-[12px] text-neutral-400">{senderName}</span>
              </div>
              <div className="px-5 py-2">
                <div className="flex items-center gap-3 border-b border-neutral-100 py-2.5">
                  <span className="w-10 shrink-0 text-[13px] font-medium text-neutral-400">To</span>
                  <span className="min-w-0 truncate text-[14px] text-neutral-800">{lead.email || "No email yet"}</span>
                </div>
                <div className="flex items-center gap-3 border-b border-neutral-100 py-2.5">
                  <span className="w-10 shrink-0 text-[13px] font-medium text-neutral-400">Subj</span>
                  {drafting ? (
                    <div className="min-w-0 flex-1">
                      <EmailFieldSkeleton />
                    </div>
                  ) : (
                    <input
                      className="min-w-0 flex-1 bg-transparent text-[14px] text-neutral-800 outline-none"
                      value={subject}
                      onChange={(event) => onSubjectChange(event.target.value)}
                      placeholder="Subject"
                    />
                  )}
                </div>
                <div className="py-4">
                  {drafting ? (
                    <EmailFieldSkeleton lines={6} />
                  ) : (
                    <EmailComposeEditor key={lead.id} value={body} onChange={onBodyChange} />
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3">
                <p
                  className={cn(
                    "min-w-0 truncate text-[12px]",
                    sendMessage && /fail|error|not found|cannot|expired|invalid/i.test(sendMessage)
                      ? "text-red-600"
                      : sendMessage?.startsWith("Sent")
                        ? "text-emerald-600"
                        : "text-neutral-500",
                  )}
                >
                  {sendMessage ? sendMessage : inboxEmail ? `Sends from ${inboxEmail}` : "Connect Gmail to send as you."}
                </p>
                {inboxEmail ? (
                  <ThreeDButton
                    type="button"
                    variant="solid"
                    size="sm"
                    disabled={sending || drafting || !subject.trim() || !htmlToPlain(body) || !lead.email}
                    onClick={onSend}
                  >
                    {sending ? "Sending…" : "Send"}
                  </ThreeDButton>
                ) : (
                  <ThreeDButton href="/api/inboxes/gmail/start?next=%2Fdashboard%2Fcampaigns%3Fpanel%3Dsettings" variant="solid" size="sm">
                    Connect Gmail
                  </ThreeDButton>
                )}
              </div>
            </>
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="text-[13px] font-medium text-neutral-800">Select a person to write an email</p>
              <p className="mt-1 text-[12px] text-neutral-500">Add follow-ups below when you are ready to chain the sequence.</p>
            </div>
          )}
        </article>

        {followups.map((step, index) => (
          <div key={step.id} className="flex w-full flex-col items-center">
            <ChainConnector />
            <article className="w-full rounded-lg border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <StepBadge index={index + 1} delayDays={step.delayDays} />
                  <div className="flex items-center gap-1 text-[11px] text-neutral-400">
                    <span>after</span>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={step.delayDays}
                      onChange={(event) =>
                        patchStep(step.id, { delayDays: Math.max(0, Math.min(60, Number(event.target.value) || 0)) })
                      }
                      className="input h-6 w-12 rounded-md border border-neutral-200 px-1 text-center text-[11px]"
                    />
                    <span>days</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={generatingId === step.id}
                    onClick={() => void generateStep(step.id)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#4379EE] hover:text-[#3567D6] disabled:opacity-50"
                  >
                    {generatingId === step.id ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                    {step.body?.trim() ? "Rewrite" : "Write with AI"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteStep(step.id)}
                    aria-label="Remove step"
                    className="text-neutral-400 hover:text-red-600"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <div className="px-5 py-2">
                <div className="flex items-center gap-3 border-b border-neutral-100 py-2.5">
                  <span className="w-10 shrink-0 text-[13px] font-medium text-neutral-400">Subj</span>
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[14px] text-neutral-800 outline-none"
                    value={step.subject ?? ""}
                    onChange={(event) => patchStep(step.id, { subject: event.target.value })}
                    placeholder="Follow-up subject (uses {{first_name}}, {{company}})"
                  />
                </div>
                <div className="py-3">
                  {generatingId === step.id ? (
                    <EmailFieldSkeleton lines={4} />
                  ) : (
                    <textarea
                      className="h-32 w-full resize-y bg-transparent text-[13px] leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-400"
                      value={step.body}
                      onChange={(event) => patchStep(step.id, { body: event.target.value })}
                      placeholder="Write a follow-up, or let AI draft one. Use {{first_name}} and {{company}} as placeholders."
                    />
                  )}
                </div>
              </div>
            </article>
          </div>
        ))}

        <ChainConnector />
        <div className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50/60 px-4 py-4">
          <span className="flex items-center gap-1 text-[12px] text-neutral-500">
            Follow up after
            <input
              type="number"
              min={0}
              max={60}
              value={addDelayDays}
              onChange={(event) => setAddDelayDays(Math.max(0, Math.min(60, Number(event.target.value) || 0)))}
              className="input h-6 w-12 rounded-md border border-neutral-200 px-1 text-center text-[11px]"
            />
            days
          </span>
          <button
            type="button"
            disabled={addBusy}
            onClick={() => void addStep(addDelayDays)}
            className="inline-flex items-center gap-1 rounded-full bg-[#4379EE] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#3567D6] disabled:opacity-50"
          >
            {addBusy ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
            Add follow-up
          </button>
        </div>
      </div>
    </div>
  );
}
