import { requireActiveBilling } from "@/lib/billing/entitlements";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueAgentTask } from "./task-executor";
import { loadOwnedTask, setTaskStatus } from "./tasks";

const MAX_ACTIVE_TASKS = 2;

export type ApprovalResult =
  | { ok: true; status: "queued"; budget: number }
  | { ok: false; httpStatus: number; error: string; code?: string };

/** Approve a planned task (or resume one paused on its budget) and start it. Shared by the card button and the chat tool. */
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

  const budget = Math.max(task.spent_credits, requestedBudget ?? task.budget_credits);
  await setTaskStatus(db, task.id, "queued", { budget_credits: budget, error: null });
  enqueueAgentTask(task.id);
  return { ok: true, status: "queued", budget };
}
