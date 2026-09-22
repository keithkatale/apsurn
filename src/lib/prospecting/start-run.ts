import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueInternalJob } from "@/lib/jobs/enqueue";
import { executeAgentProspectingRun } from "@/lib/prospecting/agent/run";
import type { ProspectCriteria } from "./types";

export interface StartProspectingRunInput {
  userId: string;
  companyId: string;
  listName: string;
  limit: number;
  criteria: ProspectCriteria;
}

export type ReserveProspectingRunResult =
  | { ok: true; listId: string; runId: string }
  | { ok: false; error: string; status: number };

export type StartProspectingRunResult = ReserveProspectingRunResult;

/**
 * Creates a prospect_lists + prospecting_runs row (stale-run cleanup +
 * concurrent-run throttle included). Shared by the in-request streaming
 * route and the weekly-schedule cron — neither starts the agent itself;
 * only startProspectingRun (below) enqueues the background job.
 */
export async function reserveProspectingRun(
  db: SupabaseClient,
  input: StartProspectingRunInput
): Promise<ReserveProspectingRunResult> {
  const staleBefore = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: staleRuns } = await db
    .from("prospecting_runs")
    .select("id,list_id")
    .eq("user_id", input.userId)
    .in("status", ["queued", "discovering", "enriching", "verifying"])
    .lt("created_at", staleBefore);
  if (staleRuns?.length) {
    const staleRunIds = staleRuns.map((run) => run.id);
    const staleListIds = staleRuns.map((run) => run.list_id);
    const staleMessage = "This run stopped after the background worker was removed. Start a new search.";
    await Promise.all([
      db.from("prospecting_runs").update({ status: "failed", stage: "failed", error_summary: staleMessage, completed_at: new Date().toISOString() }).in("id", staleRunIds),
      db.from("prospect_lists").update({ status: "failed", error: staleMessage, completed_at: new Date().toISOString() }).in("id", staleListIds),
    ]);
  }

  const { count } = await db
    .from("prospecting_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId)
    .in("status", ["queued", "discovering", "enriching", "verifying"]);
  if ((count ?? 0) >= 2) return { ok: false, error: "Two prospecting runs are already active", status: 429 };

  const { data: list, error: listError } = await db
    .from("prospect_lists")
    .insert({ user_id: input.userId, company_id: input.companyId, name: input.listName, criteria: input.criteria, status: "queued", requested_count: input.limit })
    .select()
    .single();
  if (listError || !list) return { ok: false, error: listError?.message ?? "Failed to create list", status: 500 };

  const { data: run, error: runError } = await db
    .from("prospecting_runs")
    .insert({ list_id: list.id, user_id: input.userId, status: "queued", target_count: input.limit })
    .select()
    .single();
  if (runError || !run) return { ok: false, error: runError?.message ?? "Failed to create run", status: 500 };

  return { ok: true, listId: list.id, runId: run.id };
}

/**
 * reserveProspectingRun + background agent. Used by the weekly schedule
 * cron — the interactive "Find prospects" flow runs the agent in-request
 * instead (see src/app/api/prospecting/run/route.ts).
 */
export async function startProspectingRun(
  db: SupabaseClient,
  input: StartProspectingRunInput
): Promise<StartProspectingRunResult> {
  const reserved = await reserveProspectingRun(db, input);
  if (!reserved.ok) return reserved;

  enqueueInternalJob(
    "/api/jobs/prospecting",
    { runId: reserved.runId, listId: reserved.listId },
    () => executeAgentProspectingRun(reserved.runId, reserved.listId),
  );

  return reserved;
}
