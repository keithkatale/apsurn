import { requireActiveBilling } from "@/lib/billing/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueCopilotWakeup } from "./wakeups";
import { loadOwnedTask, loadSteps, loadTask, setTaskStatus, updateStep } from "./tasks";
import { pendingSteps } from "./wakeup-messages";
import type { AgentToolContext } from "./types";

const MAX_ACTIVE_TASKS = 2;

export type ApprovalResult =
  | { ok: true; status: "queued"; budget: number }
  | { ok: false; httpStatus: number; error: string; code?: string };

/** Approve a planned task (or resume one paused on its budget). The Copilot then carries the plan out in its conversation. Shared by the card button and the chat tool. */
export async function approveAgentTask(userId: string, taskId: string, requestedBudget?: number): Promise<ApprovalResult> {
  const db = createAdminClient();
  const task = await loadOwnedTask(db, userId, taskId);
  if (!task) return { ok: false, httpStatus: 404, error: "Task not found" };
  if (task.status !== "awaiting_approval" && task.status !== "paused") {
    return { ok: false, httpStatus: 409, error: `This task is already ${task.status}.` };
  }

  try {
    await requireActiveBilling(userId);
  } catch (error) {
    return { ok: false, httpStatus: 402, error: error instanceof Error ? error.message : "Billing required", code: "billing_required" };
  }

  const { count: active } = await db
    .from("agent_tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["queued", "running", "waiting"]);
  if ((active ?? 0) >= MAX_ACTIVE_TASKS) {
    return { ok: false, httpStatus: 429, error: "Two tasks are already running. Wait for one to finish or cancel it." };
  }

  const estimate = (task.plan?.estimate ?? {}) as { low?: number };
  const { data: balanceRow } = await db.from("credit_balances").select("balance").eq("user_id", userId).maybeSingle();
  const balance = balanceRow?.balance ?? 0;
  const needed = Math.max(1, Math.min(estimate.low ?? 1, requestedBudget ?? task.budget_credits));
  if (balance < needed) {
    return { ok: false, httpStatus: 402, error: `This plan needs about ${needed} credits and you have ${balance}. Top up or trim the plan.`, code: "credits_exhausted" };
  }

  const resuming = task.status === "paused";
  const budget = Math.max(task.spent_credits, requestedBudget ?? task.budget_credits);
  await setTaskStatus(db, task.id, "running", { budget_credits: budget, error: null, started_at: task.started_at ?? new Date().toISOString() });
  if (task.conversation_id) {
    await enqueueCopilotWakeup(db, {
      conversationId: task.conversation_id,
      userId,
      kind: resuming ? "plan_continue" : "plan_approved",
      payload: { taskId: task.id },
    });
  }
  return { ok: true, status: "queued", budget };
}

/** complete_plan_step: the agent records a finished step of the approved plan it is carrying out. */
export async function completePlanStep(ctx: AgentToolContext, args: Record<string, unknown>) {
  const db = ctx.db;
  let task = ctx.taskId ? await loadTask(db, ctx.taskId) : null;
  if (!task && ctx.conversationId) {
    const { data } = await db
      .from("agent_tasks")
      .select("*")
      .eq("user_id", ctx.userId)
      .eq("conversation_id", ctx.conversationId)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    task = (data as typeof task) ?? null;
  }
  if (!task) return { error: "There is no approved plan running in this conversation." };

  const number = Math.floor(Number(args.step));
  const steps = await loadSteps(db, task.id);
  const step = steps.find((row) => row.idx === number - 1);
  if (!step) return { error: `The plan has no step ${args.step}. It has steps 1-${steps.length}.` };

  const status = args.status === "failed" || args.status === "skipped" ? args.status : "done";
  const summary = typeof args.summary === "string" && args.summary.trim() ? args.summary.trim().slice(0, 2000) : status === "done" ? "Done." : "Not completed.";
  await updateStep(db, step, { status, result_summary: summary, finished_at: new Date().toISOString() });

  const lines = steps.map((row) => ({
    idx: row.idx,
    title: row.title,
    agent: row.agent,
    instruction: row.instruction,
    status: row.id === step.id ? status : row.status,
  }));
  const remaining = pendingSteps(lines);
  if (remaining.length === 0) {
    await setTaskStatus(db, task.id, "completed");
    return { recorded: true, remaining: 0, note: "Every step is complete. Write a short wrap-up for the user: what was done, real names and numbers, anything that failed, and what to do next." };
  }
  return { recorded: true, remaining: remaining.length, next: { step: remaining[0].idx + 1, title: remaining[0].title } };
}
