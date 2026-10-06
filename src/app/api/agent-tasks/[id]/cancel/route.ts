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

  // A worker holding a live lease stops itself on its next check; otherwise cancel outright.
  const leased = task.lease_expires_at && new Date(task.lease_expires_at).getTime() > Date.now();
  const status = leased ? "cancelling" : "cancelled";
  await setTaskStatus(db, task.id, status);
  return NextResponse.json({ status });
}
