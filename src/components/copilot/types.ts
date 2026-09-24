import type { CopilotArtifact } from "@/lib/agents/types";

export type ToolCall = {
  id: string;
  name: string;
  status: "running" | "done";
  args?: Record<string, unknown>;
  result?: unknown;
  agent?: string;
  reasoning?: string;
  children?: ToolCall[];
};

export type UIMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "model"; content: string; reasoning?: string; tools?: ToolCall[]; artifacts?: CopilotArtifact[] };

export type ActiveTool = ToolCall;

export function findTool(tools: ToolCall[] | undefined, id: string): ToolCall | null {
  if (!tools) return null;
  for (const tool of tools) {
    if (tool.id === id) return tool;
    const nested = findTool(tool.children, id);
    if (nested) return nested;
  }
  return null;
}
