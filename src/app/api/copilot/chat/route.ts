import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { spendCredits } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { createRun } from "@/lib/agents/run-sink";
import { emptyRun, reduceRun } from "@/lib/agents/timeline";
import type { RunEvent } from "@/lib/agents/run-events";
import { listArtifactsForConversation } from "@/lib/copilot/artifacts";
import { generateConversationTitle } from "@/lib/copilot/title";
import { generateTaskIcon } from "@/lib/copilot/task-icon";
import { startUserMessageTurn } from "@/lib/agents/copilot-wakeup-job";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The turn starts in-process immediately; this request only boots it and returns runId.
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

  const bodyPromise = request.json().catch(() => null);
  try {
    const { requireActiveBilling } = await import("@/lib/billing/entitlements");
    // Billing checks in parallel with reading the body.
    const [, rawBody] = await Promise.all([requireActiveBilling(userId), bodyPromise]);
    await spendCredits({
      userId,
      amount: CREDIT_COSTS.copilot_turn,
      action: "copilot_turn",
    });

    const parsed = requestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
    }

    const db = createAdminClient();
    const incomingId = parsed.data.conversationId ?? null;
    let conversationId: string;
    let isFirstTurn = false;

    if (incomingId) {
      const { data: existing } = await db
        .from("copilot_conversations")
        .select("id, title")
        .eq("id", incomingId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!existing) return NextResponse.json({ error: "Task not found" }, { status: 404 });
      conversationId = existing.id as string;
      isFirstTurn = !existing.title;
    } else {
      const { data: created, error } = await db.from("copilot_conversations").insert({ user_id: userId, title: null }).select("id").single();
      if (error || !created) return NextResponse.json({ error: error?.message ?? "Failed to start task" }, { status: 500 });
      conversationId = created.id as string;
      isFirstTurn = true;
    }

    // Save the user message and open the run together, then start the model before we respond.
    const [, runId] = await Promise.all([
      db.from("copilot_messages").insert({ conversation_id: conversationId, role: "user", content: parsed.data.message }),
      createRun(db, { conversationId, userId }),
    ]);
    if (!runId) {
      return NextResponse.json(
        { error: "Copilot runs need a database update. Run supabase/migrations/0036_copilot_runs.sql in the Supabase SQL editor, then try again." },
        { status: 500 },
      );
    }

    // Model starts now — not after a wakeup row, lease claim, or HTTP `after()`.
    startUserMessageTurn({ userId, conversationId, runId });

    // Chat naming is optional chrome; never block the reply on it.
    let title: string | null = null;
    if (isFirstTurn) {
      title = generateConversationTitle(parsed.data.message);
      const icon = generateTaskIcon(`${title} ${parsed.data.message}`);
      void db.from("copilot_conversations").update({ title, icon }).eq("id", conversationId);
    }

    return NextResponse.json({ conversationId, runId, title });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "billing_required" || code === "credits_exhausted" || code === "budget_exhausted") {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Billing required", code: code ?? "billing_required" },
        { status: 402 },
      );
    }
    // requireActiveBilling / spendCredits throw with those codes; re-check billing shape.
    if ((error as { code?: string }).code) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Billing required", code: (error as { code?: string }).code ?? "billing_required" },
        { status: 402 },
      );
    }
    throw error;
  }
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
      const { data: events } = await db
        .from("copilot_run_events")
        .select("seq, data")
        .eq("run_id", activeRunId)
        .order("seq", { ascending: true })
        .limit(5000);
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
