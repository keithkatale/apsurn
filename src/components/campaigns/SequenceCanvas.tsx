"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Loader2, Plus, Sparkles, Trash2, Zap } from "lucide-react";
import { ContactAvatar } from "@/components/prospects/ContactAvatar";
import { MergeFieldText } from "@/components/campaigns/MergeFieldText";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { canvasVisibleSteps, isOnboardingAutoFollowup, sortCampaignSteps } from "@/lib/campaigns/sequence-steps";
import { cn } from "@/lib/cn";
import { htmlToPlain } from "@/lib/outreach/email-html";
import { draftStorageKey, MERGE_FIELD_KEYS, MERGE_FIELD_LABELS } from "@/lib/outreach/merge-fields";
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
      <div className="h-5 w-px border-l border-dashed border-neutral-300" />
    </div>
  );
}

export function SequenceCanvas({
  campaignId,
  steps,
  onStepsChange,
  lead,
  generatingKeys,
  onGenerateStep,
  onSaveStepDraft,
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
  billingActive = false,
  onStartTrial,
}: {
  campaignId: string;
  steps: CampaignEmailStep[];
  onStepsChange: (steps: CampaignEmailStep[]) => void;
  lead: CampaignLead | null;
  generatingKeys: Set<string>;
  onGenerateStep: (stepId: string, regenerate: boolean) => void;
  onSaveStepDraft: (stepId: string, subject: string, body: string) => void;
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
  billingActive?: boolean;
  onStartTrial?: () => void;
}) {
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
    onStepsChange(sorted.filter((step) => !isOnboardingAutoFollowup(step)));
  }, [campaignId, sorted, onStepsChange]);

  function patchStepMeta(stepId: string, patch: { delayDays?: number }) {
    onStepsChange(
      sorted.map((step) => (step.id === stepId ? { ...step, delayDays: patch.delayDays ?? step.delayDays } : step)),
    );
    void fetch(`/api/campaigns/${campaignId}/steps/${stepId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delayDays: patch.delayDays }),
    });
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
        subject: null,
        body: "",
      };
      onStepsChange([...sorted, newStep]);
    } catch {
      // ignore
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div className="sequence-canvas flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
      <div className="flex w-full flex-1 flex-col gap-0 px-4 py-4">
        <article className="w-full shrink-0 rounded-lg border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
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
            <div className="flex items-center justify-between border-b border-neutral-100 bg-[#F8F9FC] px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <ContactAvatar name={lead.fullName} linkedinUrl={lead.linkedinUrl} email={lead.email} className="size-10" />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-neutral-900">{lead.fullName || "Unknown"}</p>
                  <p className="truncate text-[12px] text-neutral-500">
                    {[lead.title, lead.companyName || lead.companyDomain].filter(Boolean).join(" · ") || "Role unknown"}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-[12px] text-neutral-400">{senderName}</span>
            </div>
          ) : (
            <div className="border-b border-neutral-100 bg-[#F8F9FC] px-5 py-3.5">
              <p className="text-[13px] font-semibold text-neutral-900">Message for everyone in this campaign</p>
              <p className="mt-0.5 text-[12px] text-neutral-500">
                Write it once. Name, title, and company fill in for each lead when it sends.
              </p>
            </div>
          )}
          <div className="px-5 py-2">
            <div className="flex items-center gap-3 border-b border-neutral-100 py-2.5">
              <span className="w-10 shrink-0 text-[13px] font-medium text-neutral-400">To</span>
              <span className="min-w-0 truncate text-[14px] text-neutral-800">
                {lead ? lead.email || "No email yet" : "Each lead in this campaign"}
              </span>
            </div>
            <div className="flex items-center gap-3 border-b border-neutral-100 py-2.5">
              <span className="w-10 shrink-0 text-[13px] font-medium text-neutral-400">Subj</span>
              {drafting ? (
                <div className="min-w-0 flex-1">
                  <EmailFieldSkeleton />
                </div>
              ) : (
                <MergeFieldText
                  value={subject}
                  onChange={onSubjectChange}
                  lead={lead}
                  placeholder="Subject — use {{first_name}} or {{company}}"
                />
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 py-2">
              {MERGE_FIELD_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onBodyChange(`${body}${body && !body.endsWith(" ") ? " " : ""}{{${key}}}`)}
                  className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 hover:bg-[#E8F1FC] hover:text-[#4379EE]"
                >
                  {MERGE_FIELD_LABELS[key]}
                </button>
              ))}
            </div>
            <div className="py-2">
              {drafting ? (
                <EmailFieldSkeleton lines={6} />
              ) : (
                <MergeFieldText
                  value={/<\/?[a-z][\s\S]*>/i.test(body) ? htmlToPlain(body) : body}
                  onChange={onBodyChange}
                  lead={lead}
                  multiline
                  placeholder="Write the email. Insert a field above so each lead gets their own version."
                />
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3">
            <p
              className={cn(
                "min-w-0 truncate text-[12px]",
                sendMessage && /fail|error|not found|cannot|expired|invalid|trial|billing|credit|plan/i.test(sendMessage)
                  ? "text-red-600"
                  : sendMessage?.startsWith("Sent")
                    ? "text-emerald-600"
                    : "text-neutral-500",
              )}
            >
              {sendMessage
                ? sendMessage
                : !lead
                  ? "Select a lead to send one, or use Send all."
                  : inboxEmail
                    ? `Sends from ${inboxEmail}`
                    : "Connect Gmail to send as you."}
            </p>
            {inboxEmail || !billingActive ? (
              <ThreeDButton
                type="button"
                variant="solid"
                size="sm"
                className="send-attention-pulse"
                disabled={
                  billingActive &&
                  (sending || drafting || !subject.trim() || !htmlToPlain(body) || !lead?.email)
                }
                onClick={() => {
                  if (!billingActive) {
                    onStartTrial?.();
                    return;
                  }
                  onSend();
                }}
              >
                {sending ? (
                  "Sending…"
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    Send
                    <span className="material-symbols-outlined text-[16px] leading-none" aria-hidden>
                      send
                    </span>
                  </span>
                )}
              </ThreeDButton>
            ) : (
              <ThreeDButton href="/dashboard/campaigns?panel=settings" variant="solid" size="sm">
                Connect to Google
              </ThreeDButton>
            )}
          </div>
        </article>

        {followups.map((step, index) => {
          const draftKey = lead ? draftStorageKey(lead.id, campaignId, step.id) : null;
          const stepBusy = Boolean(draftKey && generatingKeys.has(draftKey));
          const stepSubject = step.subject ?? "";
          const stepBody = /<\/?[a-z][\s\S]*>/i.test(step.body) ? htmlToPlain(step.body) : step.body;
          const hasContent = Boolean(stepSubject.trim() || stepBody.trim());

          return (
            <div key={step.id} className="flex w-full flex-col items-stretch">
              <ChainConnector />
              <article className="w-full shrink-0 rounded-lg border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
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
                          patchStepMeta(step.id, { delayDays: Math.max(0, Math.min(60, Number(event.target.value) || 0)) })
                        }
                        className="input h-6 w-12 rounded-md border border-neutral-200 px-1 text-center text-[11px]"
                      />
                      <span>days</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {lead ? (
                      <button
                        type="button"
                        disabled={stepBusy}
                        onClick={() => onGenerateStep(step.id, hasContent)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#4379EE] hover:text-[#3567D6] disabled:opacity-50"
                      >
                        {stepBusy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                        {hasContent ? "Rewrite" : "Write with AI"}
                      </button>
                    ) : null}
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
                  {stepBusy ? (
                    <div className="py-4">
                      <EmailFieldSkeleton lines={5} />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 border-b border-neutral-100 py-2.5">
                        <span className="w-10 shrink-0 text-[13px] font-medium text-neutral-400">Subj</span>
                        <MergeFieldText
                          value={stepSubject}
                          onChange={(next) => onSaveStepDraft(step.id, next, stepBody)}
                          lead={lead}
                          placeholder="Follow-up subject"
                        />
                      </div>
                      <div className="py-3">
                        <MergeFieldText
                          value={stepBody}
                          onChange={(next) => onSaveStepDraft(step.id, stepSubject, next)}
                          lead={lead}
                          multiline
                          placeholder="Write the follow-up. Fields fill in for each lead."
                        />
                      </div>
                    </>
                  )}
                </div>
              </article>
            </div>
          );
        })}

        <ChainConnector />
        <div className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 bg-neutral-50/60 px-4 py-4">
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
