"use client";

import LatticeLoader from "@/components/loaders/LatticeLoader";
import ThoughtLine from "@/components/loaders/ThoughtLine";
import { AGENT_DISPLAY_NAME, toolAgent, toolLabel } from "@/lib/agents/labels";
import type { SpecialistId } from "@/lib/agents/types";
import type { ToolCall } from "./types";
import "./CopilotThought.css";

const MAX_STEPS = 10;
const MAX_STEP_CHARS = 88;

export function displayAgentName(name: string, agent?: string): string {
  const id = (agent || toolAgent(name)) as SpecialistId | undefined;
  if (!id) return "Copilot";
  return AGENT_DISPLAY_NAME[id] ?? id;
}

export function isToolTreeRunning(tools: ToolCall[] | undefined): boolean {
  return Boolean(tools?.some((tool) => tool.status === "running" || isToolTreeRunning(tool.children)));
}

export function reasoningToSteps(text: string | undefined, max = 8): string[] {
  if (!text?.trim()) return [];
  const chunks: string[] = [];
  for (const block of text.split(/\n+/)) {
    const cleaned = block
      .replace(/^[-*•]\s+/, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) continue;
    const sentences = cleaned.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
    if (sentences.length > 1 && cleaned.length > 100) chunks.push(...sentences);
    else chunks.push(cleaned);
  }
  const picked = chunks.length > 0 ? chunks : [text.trim()];
  return picked.slice(-max).map((line) => (line.length > MAX_STEP_CHARS ? `${line.slice(0, MAX_STEP_CHARS - 3)}…` : line));
}

export function toolToStep(tool: ToolCall): string {
  if (tool.name === "delegate_to_agent") {
    const agent = displayAgentName(tool.name, tool.agent);
    return agent === "Copilot" ? toolLabel(tool.name) : `Handing off to ${agent}`;
  }
  return toolLabel(tool.name);
}

function mergeSteps(parts: string[][]): string[] {
  const merged = parts.flat().filter(Boolean);
  return merged.filter((step, i) => step !== merged[i - 1]).slice(-MAX_STEPS);
}

export function copilotThoughtSteps(reasoning?: string, tools?: ToolCall[]): string[] {
  return mergeSteps([
    reasoningToSteps(reasoning),
    (tools ?? []).filter((tool) => tool.name !== "delegate_to_agent").map(toolToStep),
  ]);
}

export function agentThoughtSteps(tool: ToolCall): string[] {
  return mergeSteps([reasoningToSteps(tool.reasoning), (tool.children ?? []).map(toolToStep)]);
}

export function CopilotThought({
  working,
  error = false,
  label = "Thinking…",
  doneLabel = "Thought for",
  steps = [],
  historical = false,
  elapsed,
  className = "",
}: {
  working: boolean;
  error?: boolean;
  label?: string;
  doneLabel?: string;
  steps?: string[];
  historical?: boolean;
  elapsed?: number;
  className?: string;
}) {
  const isWorking = working && !error;
  const showTimer = !historical || elapsed != null;

  return (
    <div className={`copilot-thought${className ? ` ${className}` : ""}`}>
      <LatticeLoader
        className="copilot-thought__lattice"
        status={error ? "error" : isWorking ? "working" : "done"}
        label={label}
        doneLabel={doneLabel}
        errorLabel="Failed after"
        pattern="orbit"
        grid={3}
        shape="round"
        color="var(--copilot-muted)"
        doneColor="#22c55e"
        errorColor="#ef4444"
        cellSize={6}
        gap={2}
        fontSize={14}
        step={90}
        idleOpacity={0.15}
        showTimer={false}
        elapsed={isWorking ? undefined : elapsed}
      />
      <ThoughtLine
        className="copilot-thought__line"
        working={isWorking}
        steps={steps}
        label={label}
        doneLabel={historical && elapsed == null ? (doneLabel === "Thought for" ? "Done thinking" : doneLabel) : doneLabel}
        glyph="none"
        showTimer={showTimer}
        elapsed={elapsed}
        fontSize={13}
        collapsible
        collapseOnSettle
        color="var(--copilot-muted)"
        shimmer
      />
    </div>
  );
}
