import { NextRequest, NextResponse } from "next/server";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { loadOwnedTask } from "@/lib/agents/tasks";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PAGE = 200;

/**
 * Snapshot + incremental event log for a background task. The client polls
 * with ?after=<last event id>, so a reopened tab replays everything it missed.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const { id } = await params;
  const after = Number(request.nextUrl.searchParams.get("after") ?? 0);
  const db = createAdminClient();
  const task = await loadOwnedTask(db, userId, id);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const [{ data: steps }, { data: events }] = await Promise.all([
    db
      .from("agent_task_steps")
      .select("id, idx, title, agent, status, result_summary, run_id, est_credits, output")
      .eq("task_id", task.id)
      .order("idx", { ascending: true }),
    db
      .from("agent_task_events")
      .select("id, type, payload, created_at")
      .eq("task_id", task.id)
      .gt("id", Number.isFinite(after) ? after : 0)
      .order("id", { ascending: true })
      .limit(PAGE),
  ]);

  return NextResponse.json({
    task: {
      id: task.id,
      status: task.status,
      goal: task.goal,
      budget: task.budget_credits,
      spent: task.spent_credits,
      error: task.error,
      conversationId: task.conversation_id,
    },
    steps: (steps ?? []).map((step) => {
      const output = (step.output ?? {}) as { pending?: { name?: string; args?: unknown } };
      return {
        id: step.id,
        idx: step.idx,
        title: step.title,
        agent: step.agent,
        status: step.status,
        summary: step.result_summary,
        runId: step.run_id,
        estCredits: step.est_credits,
        pendingTool: step.status === "awaiting_confirmation" ? (output.pending?.name ?? null) : null,
        pendingArgs: step.status === "awaiting_confirmation" ? (output.pending?.args ?? null) : null,
      };
    }),
    events: events ?? [],
  });
}
