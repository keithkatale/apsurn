"use client";

import { useState } from "react";
import { Check, Circle, Loader2, PauseCircle, SkipForward, X } from "lucide-react";
import type { CopilotArtifact } from "@/lib/agents/types";
import { Plan, PlanContent, PlanDescription, PlanFooter, PlanHeader, PlanTitle, PlanTrigger, PlanAction } from "@/components/ai-elements/plan";
import { Queue, QueueItem, QueueItemContent, QueueItemDescription, QueueItemIndicator, QueueList, QueueSection, QueueSectionContent, QueueSectionLabel, QueueSectionTrigger } from "@/components/ai-elements/queue";
import { useAgentTaskEvents, type TaskStep } from "../useAgentTaskEvents";

interface PlannedStep {
  title: string;
  agent: string;
  instruction: string;
}

const AGENT_LABEL: Record<string, string> = {
  researcher: "Researcher",
  signal_scout: "Signal Scout",
  listener: "Listener",
  writer: "Writer",
  operator: "Operator",
};

const STATUS_LABEL: Record<string, string> = {
  awaiting_approval: "Waiting for your approval",
  queued: "Starting…",
  running: "Running",
  waiting: "Waiting on a prospecting run",
  paused: "Paused",
  completed: "Done",
  failed: "Failed",
  cancelling: "Cancelling…",
  cancelled: "Cancelled",
};

const TOOL_LABEL: Record<string, string> = {
  send_email_now: "send an email",
  run_send_pass: "send the queued outreach emails",
  activate_sequence: "activate a sequence (it will start sending)",
};

function StepIcon({ status }: { status: TaskStep["status"] | "planned" }) {
  if (status === "done") return <Check className="size-3.5 text-emerald-500" />;
  if (status === "running") return <Loader2 className="size-3.5 animate-spin text-[#4379EE]" />;
  if (status === "failed") return <X className="size-3.5 text-red-500" />;
  if (status === "skipped") return <SkipForward className="size-3.5 text-[var(--copilot-muted)]" />;
  if (status === "awaiting_confirmation") return <PauseCircle className="size-3.5 text-amber-500" />;
  return <Circle className="size-3.5 text-[var(--copilot-muted)]" />;
}

export function PlanArtifact({ artifact, live }: { artifact: CopilotArtifact; live: ReturnType<typeof useAgentTaskEvents> }) {
  const taskId = typeof artifact.payload.taskId === "string" ? artifact.payload.taskId : null;
  const planned = (Array.isArray(artifact.payload.steps) ? artifact.payload.steps : []) as PlannedStep[];
  const estimate = (artifact.payload.estimate ?? {}) as { low?: number; high?: number };
  const { task, steps, error, refresh } = live;
  const [budget, setBudget] = useState<string>(String(artifact.payload.budget ?? estimate.high ?? ""));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const status = task?.status ?? "awaiting_approval";
  const isDraft = status === "awaiting_approval";
  const isLive = ["queued", "running", "waiting", "cancelling"].includes(status);
  const budgetPaused = status === "paused" && Boolean(task?.error);
  const confirmStep = steps.find((step) => step.status === "awaiting_confirmation");

  async function post(path: string, body: Record<string, unknown> = {}) {
    if (!taskId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/agent-tasks/${taskId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMessage(data.error ?? "Something went wrong");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const budgetNumber = Number(budget);
  const approve = () => post("approve", Number.isFinite(budgetNumber) && budgetNumber > 0 ? { budget: Math.floor(budgetNumber) } : {});

  const rows: Array<{ key: string; title: string; agent: string; status: TaskStep["status"] | "planned"; summary: string | null; instruction?: string }> =
    steps.length > 0
      ? steps.map((step) => ({ key: step.id, title: step.title, agent: step.agent ?? "", status: step.status, summary: step.summary }))
      : planned.map((step, index) => ({ key: String(index), title: step.title, agent: step.agent, status: "planned", summary: null, instruction: step.instruction }));
  const doneCount = rows.filter((row) => row.status === "done" || row.status === "skipped").length;
  const title = task?.goal ?? artifact.title ?? "Plan";
  const description = isDraft
    ? `${rows.length} step${rows.length === 1 ? "" : "s"} · ${STATUS_LABEL[status]}`
    : `${STATUS_LABEL[status] ?? status} · ${doneCount} of ${rows.length} steps done`;

  return (
    <Plan isStreaming={status === "running" || status === "queued"} defaultOpen>
      <PlanHeader>
        <div className="min-w-0">
          <p className="copilot-artifact-kicker">Plan</p>
          <PlanTitle className="mt-1">{title}</PlanTitle>
          <PlanDescription>{description}</PlanDescription>
        </div>
        <PlanAction>
          <PlanTrigger />
        </PlanAction>
      </PlanHeader>

      <PlanContent>
        <Queue>
          <QueueSection>
            <QueueSectionTrigger>
              <QueueSectionLabel count={rows.length} label={rows.length === 1 ? "task" : "tasks"} />
            </QueueSectionTrigger>
            <QueueSectionContent>
              <QueueList>
                {rows.map((row) => {
                  const done = row.status === "done" || row.status === "skipped";
                  return (
                    <QueueItem key={row.key}>
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                          {row.status === "pending" || row.status === "planned" ? <QueueItemIndicator /> : <StepIcon status={row.status} />}
                        </span>
                        <QueueItemContent completed={done}>
                          {row.title}
                          {row.agent ? <span className="ml-1.5 text-[11px] text-[var(--copilot-muted)]">{AGENT_LABEL[row.agent] ?? row.agent}</span> : null}
                        </QueueItemContent>
                      </div>
                      {isDraft && row.instruction ? <QueueItemDescription>{row.instruction}</QueueItemDescription> : null}
                    </QueueItem>
                  );
                })}
              </QueueList>
            </QueueSectionContent>
          </QueueSection>
        </Queue>


      {confirmStep ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <p>
            <span className="font-medium">{confirmStep.title}</span> wants to {TOOL_LABEL[confirmStep.pendingTool ?? ""] ?? confirmStep.pendingTool}. Go ahead?
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" className="copilot-artifact-btn copilot-artifact-btn-solid" disabled={busy} onClick={() => void post("confirm", { stepId: confirmStep.id, approve: true })}>
              Approve
            </button>
            <button type="button" className="copilot-artifact-btn" disabled={busy} onClick={() => void post("confirm", { stepId: confirmStep.id, approve: false })}>
              Skip
            </button>
          </div>
        </div>
      ) : null}

      {task?.error && status !== "awaiting_approval" ? <p className="mt-2 text-[13px] text-red-500">{task.error}</p> : null}

      </PlanContent>

      <PlanFooter>
        <span className="copilot-artifact-meta mr-auto">
          {isDraft ? `Estimated ${estimate.low ?? "?"}–${estimate.high ?? "?"} credits` : `${task?.spent ?? 0} of ${task?.budget ?? "?"} credits used`}
        </span>
        {isDraft || budgetPaused ? (
          <>
            <label className="flex items-center gap-1.5 text-[12px] text-[var(--copilot-muted)]">
              Budget
              <input
                type="number"
                min={1}
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                className="w-20 rounded-md border border-[var(--copilot-card-border)] bg-transparent px-2 py-1 text-[13px] text-[var(--copilot-foreground)]"
              />
              credits
            </label>
            <button type="button" className="copilot-artifact-btn copilot-artifact-btn-solid" disabled={busy || !taskId} onClick={() => void approve()}>
              {busy ? "Starting…" : budgetPaused ? "Raise budget & resume" : "Approve & run"}
            </button>
          </>
        ) : null}
        {isDraft || isLive || status === "paused" ? (
          <button type="button" className="copilot-artifact-btn" disabled={busy || !taskId} onClick={() => void post("cancel")}>
            Cancel
          </button>
        ) : null}
      </PlanFooter>
      {isDraft ? <p className="px-4 pb-4 text-[12px] text-[var(--copilot-muted)]">Runs in the background — you can close this tab. Sends always ask first.</p> : null}
      {message || error ? <p className="px-4 pb-4 text-[13px] text-red-500">{message ?? error}</p> : null}
    </Plan>
  );
}
