import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { ResponseFunctionToolCall, ResponseInputItem, ResponseOutputItem } from "openai/resources/responses/responses";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { getAiClient, toFunctionTool } from "@/lib/ai/openai";
import { COPILOT_SYSTEM_INSTRUCTION, COPILOT_TOOL_DECLARATIONS, getAccountSnapshot, runCopilotTool } from "@/lib/copilot/tools";
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
            if (event.type === "response.output_text.delta") {
              roundText += event.delta;
              send({ type: "token", text: event.delta });
            } else if (event.type === "response.completed") {
              outputItems = event.response.output;
            } else if (event.type === "error") {
              throw new Error(event.message);
            }
          }

          for (const item of outputItems) input.push(item as ResponseInputItem);

          const calls = outputItems.filter((item): item is ResponseFunctionToolCall => item.type === "function_call");
          if (calls.length === 0) {
            finalText = roundText;
            break;
          }
          if (roundText) send({ type: "clear_assistant" });

          const toolRows: Array<{
            conversation_id: string;
            role: "tool";
            tool_name: string;
            tool_call_id: string;
            content: string;
            metadata: { args: Record<string, unknown> };
          }> = [];

          for (const call of calls) {
            const toolName = call.name;
            const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;

            send({ type: "tool_start", name: toolName, args });
            let resultData: unknown;
            try {
              resultData = await runCopilotTool(db, userId, toolName, args);
            } catch (err) {
              resultData = { error: err instanceof Error ? err.message : "Tool failed" };
            }
            send({ type: "tool_end", name: toolName, result: resultData });

            input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(resultData) });
            toolRows.push({
              conversation_id: conversationIdFinal,
              role: "tool",
              tool_name: toolName,
              tool_call_id: call.call_id,
              content: JSON.stringify(resultData).slice(0, 20000),
              metadata: { args },
            });
          }

          if (toolRows.length > 0) await db.from("copilot_messages").insert(toolRows);
        }

        await db.from("copilot_messages").insert({ conversation_id: conversationIdFinal, role: "model", content: finalText });
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
    const { data: conversation } = await db.from("copilot_conversations").select("id, title").eq("id", id).eq("user_id", userId).maybeSingle();
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
          return { id: r.id, role: "tool" as const, toolName: r.tool_name, args: (r.metadata as { args?: unknown })?.args ?? {}, result };
        }
        return { id: r.id, role: r.role as "user" | "model", content: r.content };
      });

    return NextResponse.json({ conversationId: conversation.id, title: conversation.title, messages });
  }

  const { data: conversations } = await db
    .from("copilot_conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(40);

  return NextResponse.json({ conversations: conversations ?? [] });
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
