"use client";

import type { CopilotArtifact } from "@/lib/agents/types";
import { useAgentTaskEvents } from "../useAgentTaskEvents";
import { PlanArtifact } from "./PlanArtifact";

/**
 * The plan card exists only while the plan waits for the user (or is paused on its budget).
 * Once approved it leaves the chat: the Copilot carries the plan out as ordinary chat turns.
 */
export function PlanRunner({ artifact, onAgentWork }: { artifact: CopilotArtifact; onAgentWork?: () => void }) {
  const taskId = typeof artifact.payload.taskId === "string" ? artifact.payload.taskId : null;
  const live = useAgentTaskEvents(taskId);
  return <PlanArtifact artifact={artifact} live={live} onAgentWork={onAgentWork} />;
}
