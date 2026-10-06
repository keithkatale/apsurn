import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { enqueueAgentTask } from "@/lib/agents/task-executor";
import { loadOwnedTask, setTaskStatus, updateStep, type AgentStepRow } from "@/lib/agents/tasks";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ stepId: z.string().uuid(), approve: z.boolean() });

/** The user's answer to a paused send/activate call: run exactly that call, or skip the step. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const task = await loadOwnedTask(db, userId, id);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (task.status !== "paused") return NextResponse.json({ error: "This task isn't waiting for a confirmation." }, { status: 409 });

  const { data: step } = await db
    .from("agent_task_steps")
    .select("*")
    .eq("id", parsed.data.stepId)
    .eq("task_id", task.id)
    .eq("status", "awaiting_confirmation")
    .maybeSingle();
  if (!step) return NextResponse.json({ error: "That step isn't waiting for a confirmation." }, { status: 404 });

  const row = step as AgentStepRow;
  if (parsed.data.approve) {
    await updateStep(db, row, { status: "pending", output: { ...row.output, confirmed: true } });
  } else {
    await updateStep(db, row, { status: "skipped", result_summary: "Skipped — you declined this action.", finished_at: new Date().toISOString() });
  }
  await setTaskStatus(db, task.id, "queued");
  enqueueAgentTask(task.id);
  return NextResponse.json({ status: "queued" });
}
