"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { CreateSequenceModal } from "./CreateSequenceModal";

interface SequenceOption {
  id: string;
  name: string;
  status: string;
  stepCount: number;
}

export function EnrollInSequenceModal({
  contactIds,
  onDone,
  trigger,
}: {
  contactIds: string[];
  onDone?: () => void;
  trigger?: (openModal: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sequences, setSequences] = useState<SequenceOption[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ enrolled: number; skipped: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch("/api/sequences", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setSequences(data.sequences ?? []))
      .catch(() => setSequences([]));
  }, [open]);

  function openModal() {
    setSequences(null);
    setResult(null);
    setError(null);
    setOpen(true);
  }

  async function enroll() {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sequences/${selectedId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to enroll contacts");
      setResult({ enrolled: data.enrolled, skipped: data.skipped });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enroll contacts");
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setOpen(false);
    onDone?.();
  }

  return (
    <>
      {trigger ? (
        trigger(openModal)
      ) : (
        <ThreeDButton variant="soft" size="sm" onClick={openModal}>
          <Send className="size-4" />
          <span>Enroll in sequence</span>
        </ThreeDButton>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6">
          <div className="mt-10 flex w-full max-w-md flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-neutral-900">
                Enroll {contactIds.length} contact{contactIds.length === 1 ? "" : "s"}
              </h2>
              <ThreeDButton type="button" variant="soft" size="sm" onClick={close}>
                Close
              </ThreeDButton>
            </div>

            {result ? (
              <p className="text-sm text-neutral-700">
                Enrolled {result.enrolled}
                {result.skipped > 0
                  ? ` · skipped ${result.skipped} (no email, already enrolled, or archived)`
                  : ""}
                .
              </p>
            ) : sequences === null ? (
              <p className="text-sm text-neutral-500">Loading sequences…</p>
            ) : sequences.length === 0 ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-neutral-500">
                  No sequences yet — create one to enroll these contacts into.
                </p>
                <CreateSequenceModal
                  onCreated={(sequenceId) => {
                    setSelectedId(sequenceId);
                    fetch("/api/sequences", { cache: "no-store" })
                      .then((res) => res.json())
                      .then((data) => setSequences(data.sequences ?? []));
                  }}
                />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  {sequences.map((seq) => (
                    <label
                      key={seq.id}
                      className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm has-[:checked]:border-neutral-800"
                    >
                      <input
                        type="radio"
                        name="sequence"
                        checked={selectedId === seq.id}
                        onChange={() => setSelectedId(seq.id)}
                      />
                      <span className="font-medium text-neutral-900">{seq.name}</span>
                      <span className="text-xs text-neutral-500">
                        {seq.stepCount} step{seq.stepCount === 1 ? "" : "s"} · {seq.status}
                      </span>
                    </label>
                  ))}
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <ThreeDButton
                  type="button"
                  variant="solid"
                  disabled={!selectedId || loading}
                  className="self-start"
                  onClick={enroll}
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      <span>Enrolling…</span>
                    </>
                  ) : (
                    <span>Enroll</span>
                  )}
                </ThreeDButton>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
