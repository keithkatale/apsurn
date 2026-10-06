import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized, isCronAuthorized } from "@/lib/jobs/auth";
import { enqueueAgentTask } from "@/lib/agents/task-executor";
import { setTaskStatus } from "@/lib/agents/tasks";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TASK_AGE_MS = 3 * 60 * 60_000;
const MAX_SLICES = 20;
const BATCH = 25;

/**
 * Safety net for durable agent tasks, run by Cloud Scheduler every ~2 min.
 * Self-enqueue is fire-and-forget and can be dropped, so any live task with
 * no current lease is picked back up here. Waiting tasks are re-checked too,
 * which doubles as polling for the prospecting runs they wait on.
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorized();
  const db = createAdminClient();
  const now = new Date();

  const { data: live } = await db
    .from("agent_tasks")
    .select("id, status, created_at, slice_count, lease_expires_at")
    .in("status", ["queued", "running", "waiting"])
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${now.toISOString()}`)
    .order("updated_at", { ascending: true })
    .limit(BATCH);

  let resumed = 0;
  let expired = 0;
  for (const task of live ?? []) {
    const tooOld = now.getTime() - new Date(task.created_at).getTime() > MAX_TASK_AGE_MS;
    if (tooOld || task.slice_count > MAX_SLICES) {
      await setTaskStatus(db, task.id, "failed", {
        error: tooOld ? "Stopped: the task ran longer than 3 hours." : "Stopped: the task kept getting interrupted.",
      });
      expired += 1;
      continue;
    }
    enqueueAgentTask(task.id);
    resumed += 1;
  }

  return NextResponse.json({ resumed, expired });
}
