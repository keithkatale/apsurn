import { userCompanyId } from "./shared";
import { listener } from "./listener";
import { operator } from "./operator";
import { researcher } from "./researcher";
import { writer } from "./writer";
import type { AiToolDeclaration } from "@/lib/ai/openai";
import type { AgentToolContext, SpecialistId, SpecialistModule } from "./types";

/** The work areas Copilot does itself. Each module only supplies tools now; there are no sub-agents. */
const SPECIALISTS: Record<SpecialistId, SpecialistModule> = {
  researcher,
  listener,
  writer,
  operator,
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
  const kind = args.kind === "market" || args.kind === "prospecting" ? args.kind : "all";
  const result: Record<string, unknown> = {};

  if (kind === "prospecting" || kind === "all") {
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
  }

  if (kind === "market" || kind === "all") {
    const companyId = await userCompanyId(ctx.db, ctx.userId);
    if (!companyId) {
      result.market = { message: "No company yet." };
    } else {
      const [{ data: keywords }, { data: accounts }] = await Promise.all([
        ctx.db.from("market_keywords").select("keyword, is_active, last_scanned_at").eq("company_id", companyId),
        ctx.db.from("market_accounts").select("handle, platform, is_followed, last_scanned_at").eq("company_id", companyId).eq("is_followed", true),
      ]);
      result.market = {
        keywords: keywords ?? [],
        followedAccounts: accounts ?? [],
      };
    }
  }

  return result;
}
