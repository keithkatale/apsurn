"use client";

import { useMemo } from "react";
import type { CopilotArtifact } from "@/lib/agents/types";
import { TaskTranscript } from "../TaskTranscript";
import { useAgentTaskEvents } from "../useAgentTaskEvents";
import { PlanArtifact } from "./PlanArtifact";

/** The plan card (a checklist the run ticks off) with the run's reasoning and tool calls flowing beneath it like a chat turn. */
export function PlanRunner({ artifact }: { artifact: CopilotArtifact }) {
  const taskId = typeof artifact.payload.taskId === "string" ? artifact.payload.taskId : null;
  const live = useAgentTaskEvents(taskId);
  const { task, steps, events } = live;
  const summary = useMemo(() => {
    if (task?.status !== "completed") return null;
    const row = [...events].reverse().find((event) => event.type === "task_summary");
    return typeof row?.payload.summary === "string" ? row.payload.summary : null;
  }, [events, task?.status]);
  const total = (Array.isArray(artifact.payload.steps) ? artifact.payload.steps.length : 0) || steps.length;

  return (
    <div className="space-y-4">
      <PlanArtifact artifact={artifact} live={live} />
      <TaskTranscript steps={steps} events={events} summary={summary} total={total} />
    </div>
  );
}
