"use client";

import { CopilotMarkdown } from "./CopilotMarkdown";
import { CopilotTurnProgress } from "./CopilotTurnProgress";
import type { ToolCall } from "./types";
import type { TaskEvent, TaskStep } from "./useAgentTaskEvents";

function stepTranscript(events: TaskEvent[], stepId: string): { reasoning: string; tools: ToolCall[] } {
  let reasoning = "";
  const tools: ToolCall[] = [];
  const byId = new Map<string, ToolCall>();
  for (const event of events) {
    const { payload } = event;
    if (payload.stepId !== stepId) continue;
    if (event.type === "reasoning" && typeof payload.text === "string") reasoning += payload.text;
    else if ((event.type === "tool_start" || event.type === "tool_end") && typeof payload.name === "string") {
      const id = String(payload.id ?? event.id);
      let tool = byId.get(id);
      if (!tool) {
        tool = { id, name: payload.name, status: "running", args: (payload.args as Record<string, unknown>) ?? {}, agent: typeof payload.agent === "string" ? payload.agent : undefined };
        byId.set(id, tool);
        tools.push(tool);
      }
      if (event.type === "tool_end") {
        tool.status = "done";
        tool.result = payload.result;
      }
    }
  }
  return { reasoning, tools };
}

/**
 * What a running plan is doing, shown the way a chat turn is: the agent's
 * reasoning and tool calls for each step as they happen, with the plan card
 * above it ticking items off. Only steps that have started appear.
 */
export function TaskTranscript({ steps, events, summary, total }: { steps: TaskStep[]; events: TaskEvent[]; summary: string | null; total: number }) {
  const started = steps.filter((step) => step.status !== "pending");
  if (started.length === 0 && !summary) return null;
  return (
    <div className="space-y-4">
      {started.map((step) => {
        const { reasoning, tools } = stepTranscript(events, step.id);
        const running = step.status === "running";
        return (
          <section key={step.id} className="space-y-2">
            <p className="text-[12px] font-medium text-[var(--copilot-muted)]">
              Step {step.idx + 1} of {total} · {step.title}
            </p>
            <CopilotTurnProgress reasoning={reasoning} tools={tools} working={running} historical={!running} error={step.status === "failed"} />
            {step.status === "failed" && step.summary ? <p className="text-[13px] text-red-500">{step.summary}</p> : null}
          </section>
        );
      })}
      {summary ? <CopilotMarkdown content={summary} /> : null}
    </div>
  );
}
