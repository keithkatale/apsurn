import { researcher } from "./researcher";
import type { AiToolDeclaration } from "@/lib/ai/openai";
import type { AgentToolContext, SpecialistId, SpecialistModule } from "./types";

/** Work areas Copilot uses. Each module only supplies tools; there are no sub-agents. */
const SPECIALISTS: Record<SpecialistId, SpecialistModule> = {
  researcher,
};

export function specialistForTool(name: string): SpecialistModule | null {
  for (const specialist of Object.values(SPECIALISTS)) {
    if (specialist.tools.some((tool) => tool.name === name)) return specialist;
  }
  return null;
}

/** Every tool from every work area, once per name. */
export function allWorkTools(taken: Set<string>, only?: SpecialistId[]): AiToolDeclaration[] {
  const out: AiToolDeclaration[] = [];
  for (const specialist of Object.values(SPECIALISTS)) {
    if (only && !only.includes(specialist.id)) continue;
    for (const tool of specialist.tools) {
      if (taken.has(tool.name)) continue;
      taken.add(tool.name);
      out.push(tool);
    }
  }
  return out;
}

export async function runSpecialistTool(ctx: AgentToolContext, name: string, args: Record<string, unknown>) {
  const specialist = specialistForTool(name);
  if (!specialist) throw new Error(`Unknown tool: ${name}`);
  return specialist.runTool(ctx, name, args);
}

export async function getAgentStatus(ctx: AgentToolContext, args: Record<string, unknown>) {
  const result: Record<string, unknown> = {};

  let query = ctx.db
    .from("prospecting_runs")
    .select("id, status, stage, target_count, processed_count, contact_count, error_summary, created_at, completed_at, updated_at")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (typeof args.runId === "string") {
    query = ctx.db
      .from("prospecting_runs")
      .select("id, status, stage, target_count, processed_count, contact_count, error_summary, created_at, completed_at, updated_at")
      .eq("user_id", ctx.userId)
      .eq("id", args.runId)
      .limit(1);
  }
  const { data: run } = await query.maybeSingle();
  result.prospecting = run ?? null;

  return result;
}
