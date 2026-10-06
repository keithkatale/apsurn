import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { spendCredits } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { runCopilotTurn } from "@/lib/agents/copilot-turn";
import { acquireTurnLease, enqueueCopilotWakeup, isConversationBusy } from "@/lib/agents/wakeups";
import { listArtifactsForConversation } from "@/lib/copilot/artifacts";
import { getAccountSnapshot } from "@/lib/copilot/tools";
import { generateConversationTitle } from "@/lib/copilot/title";
import { generateTaskIcon } from "@/lib/copilot/task-icon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const requestSchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1).max(4000),
});

function sseEncode(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

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

  // One live turn per conversation. If a background turn (plan step, run analysis) is mid-flight, queue this message behind it.
  const lease = await acquireTurnLease(db, conversationIdFinal);
  if (!lease) {
    await enqueueCopilotWakeup(db, { conversationId: conversationIdFinal, userId, kind: "user_message" });
    return NextResponse.json({ queued: true, conversationId: conversationIdFinal, title });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => controller.enqueue(sseEncode(payload));

      try {
        send({ type: "meta", conversationId: conversationIdFinal, title });

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

        await runCopilotTurn({
          db,
          userId,
          conversationId: conversationIdFinal,
          send,
          isCancelled: () => request.signal.aborted,
          deadlineAt: Date.now() + (maxDuration - 10) * 1000,
        });

        send({ type: "done", conversationId: conversationIdFinal });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Copilot failed" });
      } finally {
        await lease.release();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
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
        const meta = (r.metadata ?? {}) as { artifactIds?: string[] };
        return { id: r.id, role: r.role as "user" | "model", content: r.content, artifactIds: meta.artifactIds ?? [] };
      });

    const artifacts = await listArtifactsForConversation(db, userId, id);
    const agentBusy = await isConversationBusy(db, id);
    return NextResponse.json({
      agentBusy,
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
