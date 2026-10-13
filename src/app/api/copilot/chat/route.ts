import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { spendCredits } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { enqueueCopilotWakeup } from "@/lib/agents/wakeups";
import { createRun } from "@/lib/agents/run-sink";
import { emptyRun, reduceRun } from "@/lib/agents/timeline";
import type { RunEvent } from "@/lib/agents/run-events";
import { listArtifactsForConversation } from "@/lib/copilot/artifacts";
import { getAccountSnapshot } from "@/lib/copilot/tools";
import { generateConversationTitle } from "@/lib/copilot/title";
import { generateTaskIcon } from "@/lib/copilot/task-icon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The turn itself runs in the background job (/api/jobs/copilot-turn); this request only starts it.
export const maxDuration = 30;

const requestSchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1).max(4000),
});

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  try {
    const { requireActiveBilling } = await import("@/lib/billing/entitlements");
    await requireActiveBilling(userId);
    await spendCredits({
      userId,
      amount: CREDIT_COSTS.copilot_turn,
      action: "copilot_turn",
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Billing required",
        code: code ?? "billing_required",
      },
      { status: 402 },
    );
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const db = createAdminClient();

  let conversationId = parsed.data.conversationId;
  if (conversationId) {
    const { data: existing } = await db.from("copilot_conversations").select("id").eq("id", conversationId).eq("user_id", userId).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  } else {
    const { data: created, error } = await db.from("copilot_conversations").insert({ user_id: userId, title: null }).select("id").single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? "Failed to start task" }, { status: 500 });
    conversationId = created.id;
  }
  const conversationIdFinal: string = conversationId as string;

  const { count: existingCount } = await db
    .from("copilot_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationIdFinal)
    .eq("role", "user");
  const isFirstTurn = (existingCount ?? 0) === 0;

  await db.from("copilot_messages").insert({ conversation_id: conversationIdFinal, role: "user", content: parsed.data.message });

  let title: string | null = null;
  if (isFirstTurn) {
    title = await generateConversationTitle(parsed.data.message);
    const icon = generateTaskIcon(`${title} ${parsed.data.message}`);
    await db.from("copilot_conversations").update({ title, icon }).eq("id", conversationIdFinal);
  }

  if (isFirstTurn) {
    const snapshot = await getAccountSnapshot(db, userId);
    await db.from("copilot_messages").insert({
      conversation_id: conversationIdFinal,
      role: "tool",
      tool_name: "get_account_snapshot",
      tool_call_id: "briefing",
      content: JSON.stringify(snapshot).slice(0, 20000),
      metadata: { args: {} },
    });
  }

  // The turn runs on the server, independent of this request: closing the tab or reloading does not stop it. The
  // chat follows its progress through GET /api/copilot/runs/<runId>/events.
  const runId = await createRun(db, { conversationId: conversationIdFinal, userId });
  if (!runId) {
    return NextResponse.json(
      { error: "Copilot runs need a database update. Run supabase/migrations/0036_copilot_runs.sql in the Supabase SQL editor, then try again." },
      { status: 500 },
    );
  }
  const queued = await enqueueCopilotWakeup(db, { conversationId: conversationIdFinal, userId, kind: "user_message", payload: { runId } });
  if (!queued) {
    await db.from("copilot_runs").update({ status: "error", error: "Could not start the run.", finished_at: new Date().toISOString() }).eq("id", runId);
    return NextResponse.json({ error: "Could not start the run. Try again." }, { status: 500 });
  }

  return NextResponse.json({ conversationId: conversationIdFinal, runId, title });
}

/** The run still working on this conversation, if any. A run whose heartbeat stopped is a dead run and is closed out. */
async function findActiveRunId(db: ReturnType<typeof createAdminClient>, conversationId: string): Promise<string | null> {
  const { data: run, error } = await db
    .from("copilot_runs")
    .select("id, heartbeat_at")
    .eq("conversation_id", conversationId)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !run) return null;
  if (Date.now() - new Date(run.heartbeat_at as string).getTime() > 90_000) {
    await db.from("copilot_runs").update({ status: "error", error: "The run stopped unexpectedly.", finished_at: new Date().toISOString() }).eq("id", run.id);
    return null;
  }
  return run.id as string;
}

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const db = createAdminClient();
  const id = request.nextUrl.searchParams.get("id");

  if (id) {
    const { data: conversation } = await db
      .from("copilot_conversations")
      .select("id, title, icon, created_at")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!conversation) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const { data: rows } = await db
      .from("copilot_messages")
      .select("id, role, content, tool_name, tool_call_id, metadata, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    const messages = (rows ?? [])
      .filter((r) => r.tool_call_id !== "briefing" && !(r.metadata as { synthetic?: boolean } | null)?.synthetic)
      .map((r) => {
        if (r.role === "tool") {
          let result: unknown = null;
          try {
            result = JSON.parse(r.content);
          } catch {
            result = r.content;
          }
          const meta = (r.metadata ?? {}) as { args?: unknown; agent?: string; callId?: string; parentCallId?: string };
          return {
            id: r.id,
            role: "tool" as const,
            toolName: r.tool_name,
            args: meta.args ?? {},
            result,
            agent: meta.agent,
            callId: meta.callId,
            parentCallId: meta.parentCallId,
          };
        }
        const meta = (r.metadata ?? {}) as { artifactIds?: string[]; timeline?: unknown; runId?: string; error?: string };
        return {
          id: r.id,
          role: r.role as "user" | "model",
          content: r.content,
          artifactIds: meta.artifactIds ?? [],
          timeline: Array.isArray(meta.timeline) ? meta.timeline : undefined,
          runId: meta.runId,
          error: meta.error,
        };
      });

    const artifacts = await listArtifactsForConversation(db, userId, id);
    const activeRunId = await findActiveRunId(db, id);
    // The run as it stands now, so the chat paints the live view at once and only tails what comes after.
    let run: { id: string; items: unknown; label: string; lastSeq: number; status: string } | null = null;
    if (activeRunId) {
      const { data: events } = await db.from("copilot_run_events").select("seq, data").eq("run_id", activeRunId).order("seq", { ascending: true }).limit(5000);
      let state = emptyRun();
      for (const row of events ?? []) state = reduceRun(state, row.seq as number, row.data as RunEvent);
      run = { id: activeRunId, items: state.items, label: state.label, lastSeq: state.lastSeq, status: state.status };
    }
    return NextResponse.json({
      activeRunId,
      run,
      conversationId: conversation.id,
      title: conversation.title,
      icon: conversation.icon,
      createdAt: conversation.created_at,
      messages,
      artifacts,
    });
  }

  const { data: conversations } = await db
    .from("copilot_conversations")
    .select("id, title, icon, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(40);

  // Latest background-task status per conversation, for the sidebar's status dot.
  const ids = (conversations ?? []).map((conversation) => conversation.id);
  const taskStatusByConversation = new Map<string, string>();
  if (ids.length > 0) {
    const { data: tasks, error: tasksError } = await db
      .from("agent_tasks")
      .select("conversation_id, status, created_at")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false });
    if (!tasksError) {
      for (const task of tasks ?? []) {
        if (task.conversation_id && !taskStatusByConversation.has(task.conversation_id)) {
          taskStatusByConversation.set(task.conversation_id, task.status);
        }
      }
    }
  }

  const { data: company } = await db.from("companies").select("name").eq("user_id", userId).maybeSingle();
  return NextResponse.json({
    conversations: (conversations ?? []).map((conversation) => ({
      ...conversation,
      taskStatus: taskStatusByConversation.get(conversation.id) ?? null,
    })),
    companyName: company?.name ?? null,
  });
}

export async function DELETE(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db.from("copilot_conversations").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true });
}

const renameSchema = z.object({ title: z.string().trim().min(1).max(80) });

export async function PATCH(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const parsed = renameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const { data, error } = await db
    .from("copilot_conversations")
    .update({ title: parsed.data.title })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id, title")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  return NextResponse.json({ id: data.id, title: data.title });
}
