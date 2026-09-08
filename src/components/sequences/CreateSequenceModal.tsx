"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Loader2, X } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

interface StepDraft {
  subject_template: string;
  body_template: string;
  delay_days: number;
  stop_on_reply: boolean;
}

function blankStep(): StepDraft {
  return { subject_template: "", body_template: "", delay_days: 0, stop_on_reply: true };
}

export function CreateSequenceModal({
  onCreated,
  trigger,
}: {
  onCreated?: (sequenceId: string) => void;
  trigger?: (openModal: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([blankStep()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function createSequence(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || steps.some((s) => !s.body_template.trim())) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          steps: steps.map((s) => ({
            subject_template: s.subject_template.trim() || null,
            body_template: s.body_template,
            delay_days: s.delay_days,
            stop_on_reply: s.stop_on_reply,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create sequence");
      setOpen(false);
      setName("");
      setSteps([blankStep()]);
      router.refresh();
      onCreated?.(data.sequenceId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sequence");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {trigger ? (
        trigger(() => setOpen(true))
      ) : (
        <ThreeDButton variant="solid" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          <span>New sequence</span>
        </ThreeDButton>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6">
          <form
            onSubmit={createSequence}
            className="mt-10 flex w-full max-w-lg flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-neutral-900">New sequence</h2>
              <ThreeDButton type="button" variant="soft" size="sm" onClick={() => setOpen(false)}>
                Cancel
              </ThreeDButton>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-neutral-700">Sequence name</span>
              <input
                className="input"
                placeholder="e.g. Cold outreach — SaaS founders"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <div className="flex flex-col gap-3">
              {steps.map((step, index) => (
                <div key={index} className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-500">Step {index + 1}</span>
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSteps((prev) => prev.filter((_, i) => i !== index))}
                        className="text-neutral-400 hover:text-neutral-700"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <input
                    className="input"
                    placeholder="Subject (optional)"
                    value={step.subject_template}
                    onChange={(e) => updateStep(index, { subject_template: e.target.value })}
                  />
                  <textarea
                    className="input min-h-20"
                    placeholder="Email body"
                    value={step.body_template}
                    onChange={(e) => updateStep(index, { body_template: e.target.value })}
                  />
                  <label className="flex items-center gap-2 text-xs text-neutral-600">
                    Send after
                    <input
                      type="number"
                      min={0}
                      max={365}
                      className="input w-16"
                      value={step.delay_days}
                      onChange={(e) => updateStep(index, { delay_days: Number(e.target.value) })}
                    />
                    days
                  </label>
                </div>
              ))}
            </div>

            {steps.length < 10 && (
              <ThreeDButton
                type="button"
                variant="soft"
                size="sm"
                className="self-start"
                onClick={() => setSteps((prev) => [...prev, blankStep()])}
              >
                <Plus className="size-3.5" />
                <span>Add step</span>
              </ThreeDButton>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <ThreeDButton type="submit" variant="solid" disabled={loading} className="self-start">
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Creating…</span>
                </>
              ) : (
                <span>Create sequence</span>
              )}
            </ThreeDButton>
          </form>
        </div>
      )}
    </>
  );
}
