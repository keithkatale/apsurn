/**
 * Wake-ups resume a Copilot conversation from outside the chat request: a
 * prospecting run finished, a plan was approved, or a message arrived while a
 * background turn held the conversation. Rows live in copilot_wakeups
 * (migration 0033); /api/jobs/copilot-turn drains them one turn at a time.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueInternalJob } from "@/lib/jobs/enqueue";
import { isActiveRunStatus, type RunOutcome } from "./wakeup-messages";

export const COPILOT_TURN_JOB_PATH = "/api/jobs/copilot-turn";

export type WakeupKind = "run_completed" | "plan_approved" | "plan_continue" | "user_message";

export interface WakeupRow {
  id: string;
  conversation_id: string;
  user_id: string;
  kind: WakeupKind;
  payload: Record<string, unknown>;
  status: "pending" | "running" | "done" | "failed";
  attempts: number;
  created_at: string;
}

const TURN_LEASE_SECONDS = 120;
const LEASE_HEARTBEAT_MS = 30_000;

/** Start (or nudge) the job that drains this conversation's wake-ups. Safe to call repeatedly. */
export function kickConversationJob(conversationId: string) {
  enqueueInternalJob(COPILOT_TURN_JOB_PATH, { conversationId }, async () => {
    const { processConversationWakeups } = await import("./copilot-wakeup-job");
    await processConversationWakeups(conversationId);
  });
}

export async function enqueueCopilotWakeup(
  db: SupabaseClient,
  input: { conversationId: string; userId: string; kind: WakeupKind; payload?: Record<string, unknown> },
): Promise<string | null> {
  const { data, error } = await db
    .from("copilot_wakeups")
    .insert({ conversation_id: input.conversationId, user_id: input.userId, kind: input.kind, payload: input.payload ?? {} })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[copilot-wakeup] enqueue failed", input.kind, error?.message);
    return null;
  }
  kickConversationJob(input.conversationId);
  return data.id as string;
}

export interface TurnLease {
  release: () => Promise<void>;
}

/** One live turn per conversation. Returns null when another turn (chat or background) holds it. */
export async function acquireTurnLease(db: SupabaseClient, conversationId: string): Promise<TurnLease | null> {
  const owner = randomUUID();
  const { data, error } = await db.rpc("claim_copilot_turn", { p_conversation: conversationId, p_owner: owner, p_lease_seconds: TURN_LEASE_SECONDS });
  if (error) {
    console.error("[copilot-turn] lease claim failed", conversationId, error.message);
    return null;
  }
  if (data !== true) return null;

  const heartbeat = setInterval(() => {
    void db
      .from("copilot_conversations")
      .update({ turn_lease_expires_at: new Date(Date.now() + TURN_LEASE_SECONDS * 1000).toISOString() })
      .eq("id", conversationId)
      .eq("turn_lease_owner", owner);
  }, LEASE_HEARTBEAT_MS);

  return {
    release: async () => {
      clearInterval(heartbeat);
      await db
        .from("copilot_conversations")
        .update({ turn_lease_owner: null, turn_lease_expires_at: null })
        .eq("id", conversationId)
        .eq("turn_lease_owner", owner);
      // A wake-up that arrived while we held the lease would otherwise wait for the sweeper.
      const { count } = await db
        .from("copilot_wakeups")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .eq("status", "pending");
      if ((count ?? 0) > 0) kickConversationJob(conversationId);
    },
  };
}

/** True while a turn or a queued wake-up is working on this conversation, so the client keeps polling. */
export async function isConversationBusy(db: SupabaseClient, conversationId: string): Promise<boolean> {
  const [{ data: conversation }, { count }] = await Promise.all([
    db.from("copilot_conversations").select("turn_lease_expires_at").eq("id", conversationId).maybeSingle(),
    db.from("copilot_wakeups").select("id", { count: "exact", head: true }).eq("conversation_id", conversationId).in("status", ["pending", "running"]),
  ]);
  const leased = conversation?.turn_lease_expires_at ? new Date(conversation.turn_lease_expires_at as string).getTime() > Date.now() : false;
  return leased || (count ?? 0) > 0;
}

const OUTCOME_COMPANIES = 10;

/** What a run produced, shaped for the model. Null when the run does not exist or is not the user's. */
export async function loadRunOutcome(db: SupabaseClient, userId: string, runId: string): Promise<RunOutcome | null> {
  const { data: run } = await db
    .from("prospecting_runs")
    .select("id, list_id, status, target_count, processed_count, contact_count, error_summary")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!run) return null;

  const [{ data: companies }, { data: signals }] = await Promise.all([
    db
      .from("prospect_companies")
      .select("name, domain, industry, icp_fit_score, qualify_reason, contacts!contacts_prospect_company_id_fkey(full_name, title, email, email_status)")
      .eq("list_id", run.list_id)
      .is("archived_at", null)
      .order("icp_fit_score", { ascending: false, nullsFirst: false })
      .limit(OUTCOME_COMPANIES),
    db.from("prospect_signals").select("headline").eq("run_id", runId).order("score", { ascending: false, nullsFirst: false }).limit(8),
  ]);

  return {
    runId: run.id as string,
    status: run.status as string,
    target: (run.target_count as number) ?? 0,
    saved: (run.processed_count as number) ?? 0,
    contacts: (run.contact_count as number) ?? 0,
    error: (run.error_summary as string | null) ?? null,
    companies: (companies ?? []).map((row) => {
      const contacts = (row.contacts as Array<{ full_name: string | null; title: string | null; email: string | null; email_status: string | null }> | null) ?? [];
      return {
        name: String(row.name ?? ""),
        domain: String(row.domain ?? ""),
        industry: String(row.industry ?? ""),
        fit: typeof row.icp_fit_score === "number" ? Math.round(row.icp_fit_score * 100) / 100 : null,
        reason: String(row.qualify_reason ?? ""),
        contacts: contacts.map((c) => ({ name: c.full_name ?? "", title: c.title ?? "", email: c.email ?? "", emailStatus: c.email_status ?? "" })),
      };
    }),
    signals: (signals ?? []).map((row) => String(row.headline ?? "")).filter(Boolean),
  };
}

/** Called when a run reaches a terminal state: wake the conversation that started it, unless the agent already consumed the result. */
export async function wakeConversationForRun(db: SupabaseClient, runId: string) {
  const { data: run, error } = await db
    .from("prospecting_runs")
    .select("user_id, conversation_id, acknowledged_at, status")
    .eq("id", runId)
    .maybeSingle();
  // Before migration 0033 the columns don't exist; runs keep working, they just don't wake anyone.
  if (error || !run || !run.conversation_id || run.acknowledged_at || run.status === "cancelled" || isActiveRunStatus(run.status as string)) return;
  await enqueueCopilotWakeup(db, {
    conversationId: run.conversation_id as string,
    userId: run.user_id as string,
    kind: "run_completed",
    payload: { runId },
  });
}

/** Marks a run's result as seen by the agent so no duplicate analysis turn follows. */
export async function acknowledgeRun(db: SupabaseClient, runId: string) {
  await db.from("prospecting_runs").update({ acknowledged_at: new Date().toISOString() }).eq("id", runId).is("acknowledged_at", null);
}

const POLL_MS = 3_000;
const MAX_AWAIT_SECONDS = 60;

export interface AwaitRunOptions {
  runId: string;
  userId: string;
  maxWaitSeconds?: number;
  /** Epoch ms after which the surrounding request is about to be cut off. */
  deadlineAt?: number;
  isCancelled?: () => boolean;
}

/**
 * Wait for a run inside the current turn. A finished run is returned (and
 * acknowledged); a long run returns `running` and the completion wake-up
 * picks the conversation back up later.
 */
export async function awaitRun(db: SupabaseClient, options: AwaitRunOptions): Promise<Record<string, unknown>> {
  const requested = Math.min(MAX_AWAIT_SECONDS, Math.max(1, Math.floor(options.maxWaitSeconds ?? MAX_AWAIT_SECONDS)));
  const roomMs = options.deadlineAt ? options.deadlineAt - Date.now() - 20_000 : Infinity;
  const until = Date.now() + Math.max(0, Math.min(requested * 1000, roomMs));

  while (true) {
    const { data: run } = await db
      .from("prospecting_runs")
      .select("status, processed_count, target_count, stage")
      .eq("id", options.runId)
      .eq("user_id", options.userId)
      .maybeSingle();
    if (!run) return { error: "Run not found." };

    if (!isActiveRunStatus(run.status as string)) {
      const outcome = await loadRunOutcome(db, options.userId, options.runId);
      await acknowledgeRun(db, options.runId);
      return { status: run.status, finished: true, outcome };
    }
    if (Date.now() + POLL_MS > until || options.isCancelled?.()) {
      return {
        status: run.status,
        finished: false,
        will_resume: true,
        progress: `${run.processed_count ?? 0}/${run.target_count ?? 0} companies saved so far (${run.stage ?? run.status}).`,
        note: "The run is still going. Tell the user in one sentence that you will analyze the results as soon as it finishes, then end your turn — you will be woken automatically with the results.",
      };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}
