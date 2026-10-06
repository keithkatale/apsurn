/**
 * Drains a conversation's wake-ups, one agent turn at a time. Runs inside
 * /api/jobs/copilot-turn (or `after()` locally). Each wake-up appends a hidden
 * synthetic user message describing what happened, then runs the same
 * Copilot turn as a chat message, persisting rows the open chat polls.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { spendCredits } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { BACKGROUND_TURN_ROUNDS, runCopilotTurn } from "./copilot-turn";
import { loadSteps, loadTask, setTaskStatus, type AgentStepRow, type AgentTaskRow } from "./tasks";
import {
  acquireTurnLease,
  kickConversationJob,
  loadRunOutcome,
  type WakeupRow,
} from "./wakeups";
import { buildPlanMessage, buildRunCompletedMessage, pendingSteps, type PlanStepLine } from "./wakeup-messages";

/** Plan turns are chained; this bounds a plan that keeps making no progress. */
export const MAX_PLAN_CONTINUES = 12;
const MAX_WAKEUP_ATTEMPTS = 2;
/** Stay well inside the job route's maxDuration (800s). */
const JOB_BUDGET_MS = 600_000;

function toStepLines(steps: AgentStepRow[]): PlanStepLine[] {
  return steps.map((step) => ({
    idx: step.idx,
    title: step.title,
    agent: step.agent,
    instruction: step.instruction,
    status: step.status,
    resultSummary: step.result_summary,
  }));
}

async function insertSynthetic(db: SupabaseClient, conversationId: string, kind: string, content: string) {
  await db.from("copilot_messages").insert({ conversation_id: conversationId, role: "user", content, metadata: { synthetic: true, kind } });
}

async function insertAssistantNote(db: SupabaseClient, conversationId: string, content: string) {
  await db.from("copilot_messages").insert({ conversation_id: conversationId, role: "model", content, metadata: {} });
}

async function activePlan(db: SupabaseClient, conversationId: string): Promise<AgentTaskRow | null> {
  const { data } = await db
    .from("agent_tasks")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AgentTaskRow | null) ?? null;
}

async function markWakeup(db: SupabaseClient, id: string, status: WakeupRow["status"], attempts?: number) {
  await db
    .from("copilot_wakeups")
    .update({ status, ...(attempts != null ? { attempts } : {}), ...(status === "done" || status === "failed" ? { finished_at: new Date().toISOString() } : {}) })
    .eq("id", id);
}

/** Take the oldest pending wake-up for the conversation. Returns null when the queue is empty. */
async function claimNext(db: SupabaseClient, conversationId: string): Promise<WakeupRow | null> {
  const { data: next } = await db
    .from("copilot_wakeups")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!next) return null;
  const { data: claimed } = await db
    .from("copilot_wakeups")
    .update({ status: "running", attempts: (next.attempts as number) + 1 })
    .eq("id", next.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  return (claimed as WakeupRow | null) ?? null;
}

async function spendTurnCredit(wakeup: WakeupRow, taskId?: string) {
  await spendCredits({
    userId: wakeup.user_id,
    amount: CREDIT_COSTS.copilot_turn,
    action: taskId ? "agent_step" : "copilot_turn",
    metadata: { wakeupId: wakeup.id, kind: wakeup.kind },
    ...(taskId ? { taskId } : {}),
  });
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

/** Runs one wake-up. Throws only for unexpected failures; expected stops (budget, credits) are reported in chat. */
async function runWakeup(db: SupabaseClient, wakeup: WakeupRow, deadlineAt: number) {
  const { conversation_id: conversationId, user_id: userId } = wakeup;
  let taskId: string | undefined;
  let maxRounds = BACKGROUND_TURN_ROUNDS;

  if (wakeup.kind === "run_completed") {
    const runId = String(wakeup.payload.runId ?? "");
    const { data: run } = await db.from("prospecting_runs").select("acknowledged_at").eq("id", runId).maybeSingle();
    // The agent already read this result in-turn (await_run); a second analysis would repeat it.
    if (!run || run.acknowledged_at) return;
    const outcome = await loadRunOutcome(db, userId, runId);
    if (!outcome) return;
    const plan = await activePlan(db, conversationId);
    const steps = plan ? await loadSteps(db, plan.id) : [];
    await db.from("prospecting_runs").update({ acknowledged_at: new Date().toISOString() }).eq("id", runId);
    await insertSynthetic(db, conversationId, "run_completed", buildRunCompletedMessage(outcome, plan ? { goal: plan.goal, steps: toStepLines(steps) } : null));
    taskId = plan?.id;
  } else if (wakeup.kind === "plan_approved" || wakeup.kind === "plan_continue") {
    const planTaskId = String(wakeup.payload.taskId ?? "");
    const task = await loadTask(db, planTaskId);
    if (!task || task.status !== "running") return;
    const steps = await loadSteps(db, task.id);
    if (pendingSteps(toStepLines(steps)).length === 0) {
      await setTaskStatus(db, task.id, "completed");
      return;
    }
    await insertSynthetic(db, conversationId, wakeup.kind, buildPlanMessage(wakeup.kind === "plan_approved" ? "approved" : "continue", task.goal, toStepLines(steps)));
    taskId = task.id;
  } else {
    // user_message: the user's text is already in the conversation.
    const plan = await activePlan(db, conversationId);
    taskId = plan?.id;
    maxRounds = plan ? BACKGROUND_TURN_ROUNDS : 6;
  }

  try {
    // A queued user message was already charged when the chat request came in.
    if (wakeup.kind !== "user_message") await spendTurnCredit(wakeup, taskId);
  } catch (error) {
    const code = errorCode(error);
    if (code === "budget_exhausted" && taskId) {
      await setTaskStatus(db, taskId, "paused", { error: "Budget reached — raise the budget to continue." });
      await insertAssistantNote(db, conversationId, "I paused the plan because it reached its credit budget. Raise the budget and approve again to continue.");
      return;
    }
    if (code === "credits_exhausted") {
      if (taskId) await setTaskStatus(db, taskId, "paused", { error: "Out of credits." });
      await insertAssistantNote(db, conversationId, "I'm out of credits, so I stopped here. Top up and tell me to continue.");
      return;
    }
    throw error;
  }

  const result = await runCopilotTurn({ db, userId, conversationId, maxRounds, deadlineAt, taskId });

  if (!taskId) return;
  const task = await loadTask(db, taskId);
  if (!task || task.status !== "running") return;

  const remaining = pendingSteps(toStepLines(await loadSteps(db, taskId)));
  if (remaining.length === 0) {
    await setTaskStatus(db, taskId, "completed");
    return;
  }
  // The model ran out of rounds mid-plan: chain another turn. If it stopped on its own (asking the user, or waiting on a run) leave the plan running.
  if (result.exhausted) {
    const n = Number(wakeup.payload.n ?? 0) + 1;
    if (n > MAX_PLAN_CONTINUES) {
      await setTaskStatus(db, taskId, "paused", { error: "Paused after many turns without finishing." });
      await insertAssistantNote(db, conversationId, "I've been working on this plan for a while without finishing, so I paused it. Tell me to continue when you're ready.");
      return;
    }
    await db.from("copilot_wakeups").insert({ conversation_id: conversationId, user_id: userId, kind: "plan_continue", payload: { taskId, n } });
  }
}

export async function processConversationWakeups(conversationId: string): Promise<{ processed: number; claimed: boolean }> {
  const db = createAdminClient();
  const lease = await acquireTurnLease(db, conversationId);
  if (!lease) return { processed: 0, claimed: false };

  const deadlineAt = Date.now() + JOB_BUDGET_MS;
  let processed = 0;
  try {
    while (Date.now() < deadlineAt) {
      const wakeup = await claimNext(db, conversationId);
      if (!wakeup) break;
      try {
        await runWakeup(db, wakeup, deadlineAt);
        await markWakeup(db, wakeup.id, "done");
      } catch (error) {
        console.error("[copilot-wakeup] failed", wakeup.kind, wakeup.id, error);
        const retry = wakeup.attempts < MAX_WAKEUP_ATTEMPTS;
        await markWakeup(db, wakeup.id, retry ? "pending" : "failed");
        if (!retry) {
          await insertAssistantNote(db, conversationId, "I hit an error while continuing in the background. Send me a message and I'll pick it back up.");
          const taskId = typeof wakeup.payload.taskId === "string" ? wakeup.payload.taskId : undefined;
          if (taskId) await setTaskStatus(db, taskId, "paused", { error: error instanceof Error ? error.message : "Turn failed" });
        }
      }
      processed += 1;
    }
  } finally {
    await lease.release();
  }
  // Out of time with work left: continue in a fresh request.
  const { count } = await db
    .from("copilot_wakeups")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("status", "pending");
  if ((count ?? 0) > 0) kickConversationJob(conversationId);
  return { processed, claimed: true };
}
