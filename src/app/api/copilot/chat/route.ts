import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResponseFunctionToolCall, ResponseInputItem, ResponseOutputItem } from "openai/resources/responses/responses";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { getAiClient, toFunctionTool } from "@/lib/ai/openai";
import { spendCredits } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { listArtifactsForConversation } from "@/lib/copilot/artifacts";
import { COPILOT_SYSTEM_INSTRUCTION, COPILOT_TOOL_DECLARATIONS, getAccountSnapshot, runCopilotTool } from "@/lib/copilot/tools";
import type { CopilotArtifact } from "@/lib/agents/types";
import { generateConversationTitle } from "@/lib/copilot/title";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_TOOL_ROUNDS = 6;

const requestSchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().trim().min(1).max(4000),
});

interface MessageRow {
  role: "user" | "model" | "tool";
  content: string;
  tool_name: string | null;
  tool_call_id: string | null;
  metadata: Record<string, unknown>;
}

function buildResponsesInput(rows: MessageRow[]): ResponseInputItem[] {
  const input: ResponseInputItem[] = [];
  for (const row of rows) {
    if (row.role === "user") {
      input.push({ role: "user", content: row.content });
    } else if (row.role === "model") {
      if (row.content) input.push({ role: "assistant", content: row.content });
    } else if (row.role === "tool" && row.tool_name && row.tool_call_id) {
      const args = (row.metadata?.args as Record<string, unknown>) ?? {};
      input.push({ type: "function_call", call_id: row.tool_call_id, name: row.tool_name, arguments: JSON.stringify(args) });
      input.push({ type: "function_call_output", call_id: row.tool_call_id, output: row.content });
    }
  }
  return input;
}

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
    if (!existing) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  } else {
    const { data: created, error } = await db.from("copilot_conversations").insert({ user_id: userId, title: null }).select("id").single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? "Failed to start conversation" }, { status: 500 });
    conversationId = created.id;
  }

  const { count: existingCount } = await db
    .from("copilot_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "user");
  const isFirstTurn = (existingCount ?? 0) === 0;

  await db.from("copilot_messages").insert({ conversation_id: conversationId, role: "user", content: parsed.data.message });

  let title: string | null = null;
  if (isFirstTurn) {
    title = await generateConversationTitle(parsed.data.message);
    await db.from("copilot_conversations").update({ title }).eq("id", conversationId);
  }

  const { data: historyRows } = await db
    .from("copilot_messages")
    .select("role, content, tool_name, tool_call_id, metadata")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(120);

  const input = buildResponsesInput((historyRows ?? []) as MessageRow[]);
  const conversationIdFinal: string = conversationId as string;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => controller.enqueue(sseEncode(payload));

      try {
        send({ type: "meta", conversationId: conversationIdFinal, title });

        if (isFirstTurn) {
          const snapshot = await getAccountSnapshot(db, userId);
          const briefingId = "briefing";
          input.push({ type: "function_call", call_id: briefingId, name: "get_account_snapshot", arguments: "{}" });
          input.push({ type: "function_call_output", call_id: briefingId, output: JSON.stringify(snapshot) });
          await db.from("copilot_messages").insert({
            conversation_id: conversationIdFinal,
            role: "tool",
            tool_name: "get_account_snapshot",
            tool_call_id: briefingId,
            content: JSON.stringify(snapshot).slice(0, 20000),
            metadata: { args: {} },
          });
        }

        const { ai, model } = await getAiClient();
        const tools = COPILOT_TOOL_DECLARATIONS.map(toFunctionTool);
        let finalText = "";
        const turnArtifacts: CopilotArtifact[] = [];
        const nestedToolRows: Array<{
          conversation_id: string;
          role: "tool";
          tool_name: string;
          tool_call_id: string;
          content: string;
          metadata: { args: Record<string, unknown>; agent?: string; callId: string; parentCallId?: string };
        }> = [];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          send({ type: "status", status: "thinking" });

          let roundText = "";
          let outputItems: ResponseOutputItem[] = [];

          const responseStream = await ai.responses.create({
            model,
            input,
            instructions: COPILOT_SYSTEM_INSTRUCTION,
            tools,
            stream: true,
          });

          for await (const event of responseStream) {
            const type = event.type as string;
            if (type === "response.output_text.delta") {
              roundText += event.delta;
              send({ type: "reasoning", text: event.delta, agent: "copilot" });
            } else if (type === "response.reasoning_summary_text.delta" || type === "response.reasoning.delta") {
              const delta = "delta" in event && typeof event.delta === "string" ? event.delta : "";
              if (delta) send({ type: "reasoning", text: delta, agent: "copilot" });
            } else if (type === "response.completed") {
              outputItems = event.response.output;
            } else if (type === "error") {
              throw new Error(event.message);
            }
          }

          for (const item of outputItems) input.push(item as ResponseInputItem);

          const calls = outputItems.filter((item): item is ResponseFunctionToolCall => item.type === "function_call");
          if (calls.length === 0) {
            finalText = roundText;
            send({ type: "answer", text: roundText });
            break;
          }

          const toolRows: Array<{
            conversation_id: string;
            role: "tool";
            tool_name: string;
            tool_call_id: string;
            content: string;
            metadata: { args: Record<string, unknown>; agent?: string; callId: string };
          }> = [];

          for (const call of calls) {
            const toolName = call.name;
            const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;

            const agent = toolName === "delegate_to_agent" && typeof args.agent === "string" ? args.agent : undefined;
            send({
              type: "tool_start",
              id: call.call_id,
              name: toolName,
              args,
              agent,
            });
            let resultData: unknown;
            try {
              resultData = await runCopilotTool(
                {
                  db,
                  userId,
                  conversationId: conversationIdFinal,
                  parentId: call.call_id,
                  emit: (event) => {
                    send({ ...event });
                    if (event.type === "artifact" && event.artifact) turnArtifacts.push(event.artifact);
                    if (event.type === "tool_end" && event.parentId && event.name) {
                      nestedToolRows.push({
                        conversation_id: conversationIdFinal,
                        role: "tool",
                        tool_name: event.name,
                        tool_call_id: event.id ?? event.name,
                        content: JSON.stringify(event.result ?? {}).slice(0, 20000),
                        metadata: {
                          args: event.args ?? {},
                          agent: event.agent,
                          callId: event.id ?? event.name,
                          parentCallId: event.parentId,
                        },
                      });
                    }
                  },
                },
                toolName,
                args,
              );
            } catch (err) {
              resultData = { error: err instanceof Error ? err.message : "Tool failed" };
            }
            send({
              type: "tool_end",
              id: call.call_id,
              name: toolName,
              args,
              result: resultData,
              agent,
            });

            input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(resultData) });
            toolRows.push({
              conversation_id: conversationIdFinal,
              role: "tool",
              tool_name: toolName,
              tool_call_id: call.call_id,
              content: JSON.stringify(resultData).slice(0, 20000),
              metadata: { args, agent, callId: call.call_id },
            });
          }

          if (toolRows.length > 0) await db.from("copilot_messages").insert(toolRows);
          if (nestedToolRows.length > 0) {
            await db.from("copilot_messages").insert(nestedToolRows);
            nestedToolRows.length = 0;
          }
        }

        if (!finalText.trim() && (turnArtifacts.length > 0)) {
          finalText = "Done — the result is in the card below.";
          send({ type: "answer", text: finalText });
        }

        await db.from("copilot_messages").insert({
          conversation_id: conversationIdFinal,
          role: "model",
          content: finalText,
          metadata: { artifactIds: turnArtifacts.map((artifact) => artifact.id) },
        });
        await db.from("copilot_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationIdFinal);

        send({ type: "done", conversationId: conversationIdFinal });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Copilot failed" });
      } finally {
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
      .select("id, title, created_at")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

    const { data: rows } = await db
      .from("copilot_messages")
      .select("id, role, content, tool_name, tool_call_id, metadata, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });

    const messages = (rows ?? [])
      .filter((r) => r.tool_call_id !== "briefing")
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
    return NextResponse.json({
      conversationId: conversation.id,
      title: conversation.title,
      createdAt: conversation.created_at,
      messages,
      artifacts,
    });
  }

  const { data: conversations } = await db
    .from("copilot_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(40);

  const { data: company } = await db.from("companies").select("name").eq("user_id", userId).maybeSingle();
  return NextResponse.json({ conversations: conversations ?? [], companyName: company?.name ?? null });
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
  if (!data) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  return NextResponse.json({ id: data.id, title: data.title });
}
