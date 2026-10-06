import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized, isCronAuthorized } from "@/lib/jobs/auth";
import { setTaskStatus } from "@/lib/agents/tasks";
import { kickConversationJob } from "@/lib/agents/wakeups";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_TASK_AGE_MS = 3 * 60 * 60_000;
const BATCH = 25;

/**
 * Safety net for Copilot background work, run by Cloud Scheduler every ~2 min.
 * Job kicks are fire-and-forget and can be dropped, so any conversation with a
 * pending wake-up and no live turn is picked back up here, and a wake-up whose
 * turn died mid-flight (lease expired) goes back in the queue. Plans that have
 * been running for hours are stopped.
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorized();
  const db = createAdminClient();
  const now = new Date();

  // Wake-ups left "running" by a crashed job: requeue once their conversation's lease has lapsed.
  const { data: running } = await db.from("copilot_wakeups").select("id, conversation_id, attempts").eq("status", "running").limit(BATCH);
  let requeued = 0;
  for (const wakeup of running ?? []) {
    const { data: conversation } = await db.from("copilot_conversations").select("turn_lease_expires_at").eq("id", wakeup.conversation_id).maybeSingle();
    const leaseLive = conversation?.turn_lease_expires_at && new Date(conversation.turn_lease_expires_at as string).getTime() > now.getTime();
    if (leaseLive) continue;
    await db.from("copilot_wakeups").update({ status: wakeup.attempts >= 3 ? "failed" : "pending" }).eq("id", wakeup.id);
    requeued += 1;
  }

  const { data: pending } = await db.from("copilot_wakeups").select("conversation_id").eq("status", "pending").limit(BATCH);
  const conversations = [...new Set((pending ?? []).map((row) => row.conversation_id as string))];
  for (const conversationId of conversations) kickConversationJob(conversationId);

  const { data: live } = await db.from("agent_tasks").select("id, created_at").in("status", ["queued", "running", "waiting"]).limit(BATCH);
  let expired = 0;
  for (const task of live ?? []) {
    if (now.getTime() - new Date(task.created_at as string).getTime() > MAX_TASK_AGE_MS) {
      await setTaskStatus(db, task.id as string, "failed", { error: "Stopped: the plan ran longer than 3 hours." });
      expired += 1;
    }
  }

  return NextResponse.json({ requeued, kicked: conversations.length, expired });
}
