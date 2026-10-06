"use client";

import { useState } from "react";
import type { CopilotArtifact } from "@/lib/agents/types";
import { Plan, PlanContent, PlanDescription, PlanFooter, PlanHeader, PlanTitle, PlanTrigger, PlanAction } from "@/components/ai-elements/plan";
import { Queue, QueueItem, QueueItemContent, QueueItemDescription, QueueItemIndicator, QueueList, QueueSection, QueueSectionContent, QueueSectionLabel, QueueSectionTrigger } from "@/components/ai-elements/queue";
import { useAgentTaskEvents } from "../useAgentTaskEvents";

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

export function PlanArtifact({
  artifact,
  live,
  onAgentWork,
}: {
  artifact: CopilotArtifact;
  live: ReturnType<typeof useAgentTaskEvents>;
  onAgentWork?: () => void;
}) {
  const taskId = typeof artifact.payload.taskId === "string" ? artifact.payload.taskId : null;
  const planned = (Array.isArray(artifact.payload.steps) ? artifact.payload.steps : []) as PlannedStep[];
  const estimate = (artifact.payload.estimate ?? {}) as { low?: number; high?: number };
  const { task, steps, error, refresh } = live;
  const [budget, setBudget] = useState<string>(String(artifact.payload.budget ?? estimate.high ?? ""));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const status = task?.status ?? "awaiting_approval";
  const isDraft = status === "awaiting_approval";
  const budgetPaused = status === "paused";

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
      else if (path === "approve") onAgentWork?.();
      refresh();
    } finally {
      setBusy(false);
    }
  }

  const budgetNumber = Number(budget);
  const approve = () => post("approve", Number.isFinite(budgetNumber) && budgetNumber > 0 ? { budget: Math.floor(budgetNumber) } : {});

  const rows =
    steps.length > 0
      ? steps.map((step) => ({ key: step.id, title: step.title, agent: step.agent ?? "", instruction: undefined as string | undefined }))
      : planned.map((step, index) => ({ key: String(index), title: step.title, agent: step.agent, instruction: step.instruction as string | undefined }));
  const title = task?.goal ?? artifact.title ?? "Plan";

  // Approved, running, finished or cancelled: the plan card leaves the chat and the agent's own messages carry on.
  if (!task && !error) return null;
  if (task && !isDraft && !budgetPaused) return null;

  return (
    <Plan defaultOpen>
      <PlanHeader>
        <div className="min-w-0">
          <p className="copilot-artifact-kicker">Plan</p>
          <PlanTitle className="mt-1">{title}</PlanTitle>
          <PlanDescription>{`${rows.length} step${rows.length === 1 ? "" : "s"} · ${isDraft ? "Waiting for your approval" : "Paused"}`}</PlanDescription>
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
                {rows.map((row) => (
                  <QueueItem key={row.key}>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                        <QueueItemIndicator />
                      </span>
                      <QueueItemContent>
                        {row.title}
                        {row.agent ? <span className="ml-1.5 text-[11px] text-[var(--copilot-muted)]">{AGENT_LABEL[row.agent] ?? row.agent}</span> : null}
                      </QueueItemContent>
                    </div>
                    {isDraft && row.instruction ? <QueueItemDescription>{row.instruction}</QueueItemDescription> : null}
                  </QueueItem>
                ))}
              </QueueList>
            </QueueSectionContent>
          </QueueSection>
        </Queue>


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
        {isDraft || budgetPaused ? (
          <button type="button" className="copilot-artifact-btn" disabled={busy || !taskId} onClick={() => void post("cancel")}>
            Cancel
          </button>
        ) : null}
      </PlanFooter>
      {isDraft ? <p className="px-4 pb-4 text-[12px] text-[var(--copilot-muted)]">Once approved I&apos;ll work through this here, step by step. Sends always ask first.</p> : null}
      {message || error ? <p className="px-4 pb-4 text-[13px] text-red-500">{message ?? error}</p> : null}
    </Plan>
  );
}
