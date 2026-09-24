import type { AiToolDeclaration } from "@/lib/ai/openai";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SPECIALIST_IDS = ["researcher", "listener", "writer", "operator"] as const;
export type SpecialistId = (typeof SPECIALIST_IDS)[number];
export type AgentId = "copilot" | SpecialistId;

export type AgentKind = "loop" | "job";

export interface AgentDefinition {
  id: AgentId;
  name: string;
  job: string;
  kind: AgentKind;
  starter: string;
}

export type ArtifactKind = "sequence" | "lead_table" | "run";

export interface CopilotArtifact {
  id: string;
  conversationId: string;
  kind: ArtifactKind;
  title: string | null;
  payload: Record<string, unknown>;
  state: Record<string, unknown>;
}

export interface AgentToolEvent {
  type: "tool_start" | "tool_end" | "reasoning" | "artifact";
  name: string;
  agent?: SpecialistId;
  args?: Record<string, unknown>;
  result?: unknown;
  text?: string;
  id?: string;
  parentId?: string;
  artifact?: CopilotArtifact;
}

export interface AgentToolContext {
  db: SupabaseClient;
  userId: string;
  conversationId?: string;
  parentId?: string;
  emit?: (event: AgentToolEvent) => void;
}

export interface SpecialistModule {
  id: SpecialistId;
  instruction: string;
  tools: AiToolDeclaration[];
  runTool: (ctx: AgentToolContext, name: string, args: Record<string, unknown>) => Promise<unknown>;
}
