import { NextResponse } from "next/server";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { loadOwnedTask, setTaskStatus } from "@/lib/agents/tasks";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const { id } = await params;
  const db = createAdminClient();
  const task = await loadOwnedTask(db, userId, id);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (["completed", "failed", "cancelled"].includes(task.status)) return NextResponse.json({ status: task.status });

  // Stop any prospecting run the task is waiting on.
  const now = new Date().toISOString();
  const { data: runs } = await db
    .from("prospecting_runs")
    .update({ status: "cancelled", stage: "cancelled", completed_at: now })
    .eq("agent_task_id", task.id)
    .in("status", ["queued", "discovering", "enriching", "verifying"])
    .select("list_id");
  if (runs?.length) {
    await db.from("prospect_lists").update({ status: "cancelled", completed_at: now }).in("id", runs.map((run) => run.list_id));
  }

  // Plans run as Copilot turns now: cancelling stops queued follow-up turns, and any turn already running sees the status on its next check.
  if (task.conversation_id) {
    await db
      .from("copilot_wakeups")
      .update({ status: "done", finished_at: now })
      .eq("conversation_id", task.conversation_id)
      .eq("status", "pending")
      .in("kind", ["plan_approved", "plan_continue"]);
  }
  await setTaskStatus(db, task.id, "cancelled");
  return NextResponse.json({ status: "cancelled" });
}
