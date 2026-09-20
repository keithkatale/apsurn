/**
 * The directory scraping agent: a bounded OpenAI Responses API function-calling
 * loop that plans a multi-step scrape across public directories and company
 * sites, then persists qualified leads to our database.
 *
 * Modeled on the Copilot tool loop (src/app/api/copilot/chat/route.ts),
 * budget-bounded (steps / pages / companies / wall-clock), with cancellation
 * checks against prospecting_runs.status and an optional AbortSignal for the
 * interactive (in-request) run path.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResponseFunctionToolCall, ResponseInputItem, ResponseOutputItem } from "openai/resources/responses/responses";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiClient, toFunctionTool } from "@/lib/ai/openai";
import { safeAiErrorMessage } from "@/lib/ai/errors";
import { WebSearchError } from "@/lib/search/web-search";
import type { ProspectCriteria, RunStatus } from "../types";
import { budgetExhausted, type AgentRunContext } from "./context";
import { knownDirectories, seedDirectoryQueries } from "./directories";
import { AGENT_TOOL_DECLARATIONS, runAgentTool } from "./tools";

export type AgentStreamEvent =
  | { type: "token"; text: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; result: unknown };

const DEFAULT_MAX_STEPS = 40;
const DEFAULT_MAX_PAGES = 60;

// Must stay comfortably under the interactive route's `maxDuration` (300s) so
// the agent finishes and reports a result while the response is still open.
// At 8 minutes the run was guaranteed to outlive its own request: the platform
// cut the connection mid-stream ("Truncated response body" in Cloud Run logs)
// and the browser was left with a run that never reached a terminal event.
// The Inngest path has no such ceiling and passes a longer budget explicitly.
const DEFAULT_WALLCLOCK_MS = 4 * 60_000;
const BACKGROUND_WALLCLOCK_MS = 8 * 60_000;

/** The interactive run's time budget, so the UI can show honest progress and time remaining. */
export function interactiveWallclockMs(): number {
  return num("SCRAPER_WALLCLOCK_MS", DEFAULT_WALLCLOCK_MS);
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name] ?? "");
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

function systemInstruction(
  criteria: ProspectCriteria,
  productSummary: string | null,
  seeds: string[],
  known: Array<{ host: string; exampleUrl: string | null }>,
  target: number
): string {
  return `You are apsurn's autonomous lead-finding agent. Your job: find up to ${target} companies matching the user's ICP, each with a real decision-maker contact, qualify them, resolve emails, and SAVE each qualified lead.

ICP:
- Industries: ${criteria.industries.join(", ") || "(open)"}
- Company size: ${criteria.companySizeRange ?? "(any)"}
- Geographies: ${criteria.geographies.join(", ") || "(any)"}
- Target personas/titles: ${(criteria.personas ?? []).join(", ") || "decision makers"}
${productSummary ? `\nWhat the user sells (context for qualification): ${productSummary}` : ""}

Your one job is to SAVE QUALIFIED LEADS, as directly as possible. Finding potential customers comes first — everything else, including hiring/buying signals, is secondary and optional.

STEP 1 — FIND LEADS. Call find_leads with the ICP's industries, geographies and target titles. This is the main tool and usually the only one you need: each row it returns is already a specific company AND a specific matching person — nobody to extract, no page to read.
- If it returns rows, move straight to STEP 2 for each one.
- If it returns nothing, retry once with broader/simpler wording (fewer titles, or broader industries) before concluding the ICP has no matches there.
- Only if find_leads is unavailable (not configured) should you fall back to find_companies (STEP 1b below) and its slower, less reliable companions.

STEP 2 — QUALIFY, RESOLVE, SAVE. For each lead from find_leads: qualify the person against the ICP, then resolve_email using their name and companyDomain, then save_lead. Do this for every lead you have before calling find_leads again.

STEP 1b — FALLBACK, ONLY IF find_leads IS UNAVAILABLE. Decide what kind of buyer this is, then call find_companies once or twice:
- LICENSED (needs a government permit: healthcare, trucking, contractors, law) → a registry source. These name a decision maker and give a phone outright — skip straight to STEP 2.
- LISTED (software, SaaS, AI, digital) → "yc", "arbeitnow" or "remotive". For each resulting company, call find_people with its domain to get a person (only fall back to open_page + extract_people if find_people is also unavailable — most sites do not list their team, so expect that to fail).
- Anything else → web_search + open_page as a last resort.

HIRING SIGNAL — LAST RESORT, SPARE BUDGET ONLY. check_hiring_signal tells you whether a company has an open role matching the buying trigger. It is optional extra context for a lead you have already found, never a requirement for finding one, and never a reason to call it before you have saved leads or to skip a company that lacks it.

Rules:
- Never invent companies, people, emails, or domains. Only save data you actually retrieved.
- save_lead needs a contact with either a usable email (verified or accept_all) or a phone number.
- Do not repeat a tool call you have already made with the same arguments.
- If a lead yields nobody after qualification, say so in one short line and move to the next one.
- PUBLIC sources only for any fallback web browsing. Never attempt LinkedIn, Facebook, X, or other social networks directly; never attempt login-gated or paywalled pages.
- When you are done (target reached or no more productive sources), reply with a one-line summary and stop calling tools.`;
}

export interface AgentRunResult {
  found: number;
  contactCount: number;
  warnings: number;
  cancelled: boolean;
  stopReason: string;
}

async function isCancelled(db: SupabaseClient, runId: string): Promise<boolean> {
  const { data } = await db.from("prospecting_runs").select("status").eq("id", runId).maybeSingle();
  return data?.status === "cancelled";
}

export async function runDirectoryAgent(opts: {
  db: SupabaseClient;
  runId: string;
  listId: string;
  userId: string;
  listCompanyId: string;
  criteria: ProspectCriteria;
  productSummary: string | null;
  targetCount: number;
  onEvent?: (event: AgentStreamEvent) => void;
  abortSignal?: AbortSignal;
  wallclockMs?: number;
}): Promise<AgentRunResult> {
  const { db, runId, listId, userId, listCompanyId, criteria, productSummary, targetCount, onEvent, abortSignal } = opts;

  const ctx: AgentRunContext = {
    db,
    runId,
    listId,
    userId,
    listCompanyId,
    criteria,
    productSummary,
    budget: {
      maxSteps: num("SCRAPER_MAX_STEPS", DEFAULT_MAX_STEPS),
      maxPages: num("SCRAPER_MAX_PAGES", DEFAULT_MAX_PAGES),
      maxCompanies: targetCount,
      deadlineMs: Date.now() + (opts.wallclockMs ?? num("SCRAPER_WALLCLOCK_MS", DEFAULT_WALLCLOCK_MS)),
    },
    counters: { steps: 0, pagesFetched: 0, companiesSaved: 0, contactsSaved: 0, warnings: 0 },
    savedDomains: new Set(),
    pageCache: new Map(),
  };

  const seeds = seedDirectoryQueries(criteria);
  const known = await knownDirectories(db, criteria);
  const { ai, model } = await getAiClient();
  const system = systemInstruction(criteria, productSummary, seeds, known, targetCount);
  const tools = AGENT_TOOL_DECLARATIONS.map(toFunctionTool);

  const input: ResponseInputItem[] = [
    {
      role: "user",
      content: `Start scraping now. Find and save up to ${targetCount} qualified companies for the ICP above. Begin by searching for relevant directories.`,
    },
  ];

  let stopReason = "completed";

  for (let round = 0; round < ctx.budget.maxSteps; round++) {
    ctx.counters.steps = round;

    const exhausted = budgetExhausted(ctx);
    if (exhausted) {
      stopReason = exhausted;
      break;
    }
    if (abortSignal?.aborted) {
      return {
        found: ctx.counters.companiesSaved,
        contactCount: ctx.counters.contactsSaved,
        warnings: ctx.counters.warnings,
        cancelled: true,
        stopReason: "cancelled",
      };
    }
    if (await isCancelled(db, runId)) {
      return {
        found: ctx.counters.companiesSaved,
        contactCount: ctx.counters.contactsSaved,
        warnings: ctx.counters.warnings,
        cancelled: true,
        stopReason: "cancelled",
      };
    }

    let outputItems: ResponseOutputItem[] = [];
    try {
      const stream = await ai.responses.create(
        { model, input, instructions: system, tools, stream: true },
        { signal: abortSignal }
      );
      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          onEvent?.({ type: "token", text: event.delta });
        } else if (event.type === "response.completed") {
          outputItems = event.response.output;
        } else if (event.type === "error") {
          throw new Error(event.message);
        }
      }
    } catch (error) {
      // A model/provider failure is a failed run, not a run that found
      // nothing. Swallowing it here made a dead AI provider look identical to
      // "your ICP has no matches", with no way to tell them apart from the UI.
      const message = safeAiErrorMessage(error);
      console.error("[agent] generation failed:", message);
      if (round === 0 || ctx.counters.companiesSaved === 0) {
        throw new Error(`The AI provider failed: ${message}`);
      }
      // Mid-run failure with leads already saved: keep them, but say why we stopped.
      stopReason = `stopped early — the AI provider failed: ${message}`;
      break;
    }

    for (const item of outputItems) input.push(item as ResponseInputItem);

    const calls = outputItems.filter((item): item is ResponseFunctionToolCall => item.type === "function_call");
    if (calls.length === 0) {
      stopReason = "model finished";
      break;
    }

    // Run tool calls concurrently (multiple page reads/searches in flight at once). save_lead
    // calls are chained sequentially among themselves since they mutate shared dedupe/counter
    // state in ctx that isn't safe to touch from overlapping calls.
    let saveChain: Promise<unknown> = Promise.resolve();
    const outputs = await Promise.all(
      calls.map(async (call) => {
        const toolName = call.name;
        const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
        onEvent?.({ type: "tool_start", name: toolName, args });

        const run = async () => {
          try {
            return await runAgentTool(ctx, toolName, args);
          } catch (error) {
            // A broken search backend can't be recovered from by retrying with
            // a different query, and letting the agent keep trying just burns
            // the whole budget before reporting "no leads". Fail loudly instead.
            if (error instanceof WebSearchError) throw error;
            return { error: error instanceof Error ? error.message : "tool failed" };
          }
        };

        const result = toolName === "save_lead" ? await (saveChain = saveChain.then(run)) : await run();
        onEvent?.({ type: "tool_end", name: toolName, result });
        return { call_id: call.call_id, result };
      })
    );

    for (const { call_id, result } of outputs) {
      input.push({ type: "function_call_output", call_id, output: JSON.stringify(result) });
    }
  }

  return {
    found: ctx.counters.companiesSaved,
    contactCount: ctx.counters.contactsSaved,
    warnings: ctx.counters.warnings,
    cancelled: false,
    stopReason,
  };
}

/**
 * Full run entry used by Inngest: loads run/list/criteria/blueprint, drives
 * the agent, and maintains prospecting_runs / prospect_lists status + counts.
 */
export async function executeAgentProspectingRun(runId: string, listId: string) {
  const db = createAdminClient();

  const progress = async (status: RunStatus, values: Record<string, unknown> = {}) => {
    await Promise.all([
      db.from("prospecting_runs").update({ status, stage: status, updated_at: new Date().toISOString(), ...values }).eq("id", runId),
      db.from("prospect_lists").update({ status, ...(values.error_summary ? { error: values.error_summary } : {}) }).eq("id", listId),
    ]);
  };

  const { data: run } = await db.from("prospecting_runs").select("user_id,target_count").eq("id", runId).single();
  const { data: list } = await db
    .from("prospect_lists")
    .select("company_id,criteria,requested_count")
    .eq("id", listId)
    .eq("user_id", run?.user_id ?? "")
    .single();
  if (!run || !list) throw new Error("Prospecting run not found");

  const criteria = list.criteria as ProspectCriteria;
  const targetCount = list.requested_count as number;

  const { data: blueprint } = await db
    .from("company_blueprints")
    .select("product_summary")
    .eq("company_id", list.company_id)
    .maybeSingle();

  await progress("discovering", { started_at: new Date().toISOString(), target_count: targetCount });
  await progress("enriching");

  const result = await runDirectoryAgent({
    db,
    runId,
    listId,
    userId: run.user_id as string,
    listCompanyId: list.company_id as string,
    criteria,
    productSummary: (blueprint?.product_summary as string | undefined) ?? null,
    targetCount,
    // Not bounded by an HTTP response, so it can afford the full budget.
    wallclockMs: BACKGROUND_WALLCLOCK_MS,
  });

  if (result.cancelled) {
    return { found: result.found, contactCount: result.contactCount, warnings: result.warnings, cancelled: true };
  }

  const status: RunStatus = result.warnings > 0 && result.found === 0 ? "partial" : result.found > 0 ? "completed" : "partial";
  const completedAt = new Date().toISOString();
  await progress(status, {
    processed_count: result.found,
    contact_count: result.contactCount,
    warning_count: result.warnings,
    completed_at: completedAt,
  });
  await db.from("prospect_lists").update({ found_count: result.found, completed_at: completedAt }).eq("id", listId);

  return { found: result.found, contactCount: result.contactCount, warnings: result.warnings };
}
