import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { requireActiveBilling } from "@/lib/billing/entitlements";
import { enqueueAgentTask } from "@/lib/agents/task-executor";
import { loadOwnedTask, setTaskStatus } from "@/lib/agents/tasks";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ budget: z.number().int().positive().max(100_000).optional() });
const MAX_ACTIVE_TASKS = 2;

/** Approve a planned task (or resume one paused on its budget) and start it in the background. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid budget" }, { status: 400 });

  const db = createAdminClient();
  const task = await loadOwnedTask(db, userId, id);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (task.status !== "awaiting_approval" && task.status !== "paused") {
    return NextResponse.json({ error: `This task is already ${task.status}.` }, { status: 409 });
  }

  try {
    await requireActiveBilling(userId);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Billing required", code: "billing_required" }, { status: 402 });
  }

  const { count: active } = await db
    .from("agent_tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["queued", "running", "waiting"]);
  if ((active ?? 0) >= MAX_ACTIVE_TASKS) {
    return NextResponse.json({ error: "Two tasks are already running. Wait for one to finish or cancel it." }, { status: 429 });
  }

  const estimate = (task.plan?.estimate ?? {}) as { low?: number };
  const { data: balanceRow } = await db.from("credit_balances").select("balance").eq("user_id", userId).maybeSingle();
  const balance = balanceRow?.balance ?? 0;
  const needed = Math.max(1, Math.min(estimate.low ?? 1, parsed.data.budget ?? task.budget_credits));
  if (balance < needed) {
    return NextResponse.json(
      { error: `This plan needs about ${needed} credits and you have ${balance}. Top up or trim the plan.`, code: "credits_exhausted" },
      { status: 402 },
    );
  }

  const budget = Math.max(task.spent_credits, parsed.data.budget ?? task.budget_credits);
  await setTaskStatus(db, task.id, "queued", { budget_credits: budget, error: null });
  enqueueAgentTask(task.id);
  return NextResponse.json({ status: "queued", budget });
}
