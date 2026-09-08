import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Content, FunctionCall } from "@google/genai";
import { createPartFromFunctionResponse } from "@google/genai";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { createGenAIClient, getAiModel } from "@/lib/ai/vertex";
import { COPILOT_SYSTEM_INSTRUCTION, COPILOT_TOOL_DECLARATIONS, getAccountSnapshot, runCopilotTool } from "@/lib/copilot/tools";
import { readStreamChunk } from "@/lib/copilot/stream-parts";
import { generateConversationTitle } from "@/lib/copilot/title";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_TOOL_ROUNDS = 6;

const requestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(4000),
});

interface MessageRow {
  role: "user" | "model" | "tool";
  content: string;
  tool_name: string | null;
  tool_call_id: string | null;
  metadata: Record<string, unknown>;
}

function buildGeminiContents(rows: MessageRow[]): Content[] {
  const contents: Content[] = [];
  for (const row of rows) {
    if (row.role === "user") {
      contents.push({ role: "user", parts: [{ text: row.content }] });
    } else if (row.role === "model") {
      if (row.content) contents.push({ role: "model", parts: [{ text: row.content }] });
    } else if (row.role === "tool" && row.tool_name && row.tool_call_id) {
      const args = (row.metadata?.args as Record<string, unknown>) ?? {};
      let result: Record<string, unknown> = {};
      try {
        result = JSON.parse(row.content);
      } catch {
        result = { raw: row.content };
      }
      contents.push({ role: "model", parts: [{ functionCall: { id: row.tool_call_id, name: row.tool_name, args } }] });
      contents.push({ role: "user", parts: [createPartFromFunctionResponse(row.tool_call_id, row.tool_name, result)] });
    }
  }
  return contents;
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

  const contents = buildGeminiContents((historyRows ?? []) as MessageRow[]);
  const conversationIdFinal: string = conversationId as string;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => controller.enqueue(sseEncode(payload));

      try {
        send({ type: "meta", conversationId: conversationIdFinal, title });

        if (isFirstTurn) {
          const snapshot = await getAccountSnapshot(db, userId);
          const briefingId = "briefing";
          contents.push({ role: "model", parts: [{ functionCall: { id: briefingId, name: "get_account_snapshot", args: {} } }] });
          contents.push({ role: "user", parts: [createPartFromFunctionResponse(briefingId, "get_account_snapshot", snapshot as Record<string, unknown>)] });
          await db.from("copilot_messages").insert({
            conversation_id: conversationIdFinal,
            role: "tool",
            tool_name: "get_account_snapshot",
            tool_call_id: briefingId,
            content: JSON.stringify(snapshot).slice(0, 20000),
            metadata: { args: {} },
          });
        }

        const ai = createGenAIClient();
        const model = getAiModel();
        let finalText = "";

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          send({ type: "status", status: "thinking" });

          const result = await ai.models.generateContentStream({
            model,
            contents,
            config: {
              systemInstruction: COPILOT_SYSTEM_INSTRUCTION,
              tools: [{ functionDeclarations: COPILOT_TOOL_DECLARATIONS }],
            },
          });

          let roundText = "";
          const collectedCalls: FunctionCall[] = [];
          let cleared = false;

          for await (const chunk of result) {
            const { text, functionCalls } = readStreamChunk(chunk);
            if (functionCalls.length > 0) {
              if (roundText && !cleared) {
                send({ type: "clear_assistant" });
                cleared = true;
                roundText = "";
              }
              collectedCalls.push(...functionCalls);
            } else if (text) {
              roundText += text;
              send({ type: "token", text });
            }
          }

          if (collectedCalls.length === 0) {
            finalText = roundText;
            break;
          }

          const callParts: Content["parts"] = [];
          const responseParts: Content["parts"] = [];
          const toolRows: Array<{
            conversation_id: string;
            role: "tool";
            tool_name: string;
            tool_call_id: string;
            content: string;
            metadata: { args: Record<string, unknown> };
          }> = [];

          for (let i = 0; i < collectedCalls.length; i++) {
            const call = collectedCalls[i];
            const toolName = call.name ?? "unknown_tool";
            const callId = call.id ?? `${toolName}-${round}-${i}`;
            const args = call.args ?? {};

            send({ type: "tool_start", name: toolName, args });
            let resultData: unknown;
            try {
              resultData = await runCopilotTool(db, userId, toolName, args);
            } catch (err) {
              resultData = { error: err instanceof Error ? err.message : "Tool failed" };
            }
            send({ type: "tool_end", name: toolName, result: resultData });

            callParts!.push({ functionCall: { id: callId, name: toolName, args } });
            responseParts!.push(createPartFromFunctionResponse(callId, toolName, resultData as Record<string, unknown>));
            toolRows.push({
              conversation_id: conversationIdFinal,
              role: "tool",
              tool_name: toolName,
              tool_call_id: callId,
              content: JSON.stringify(resultData).slice(0, 20000),
              metadata: { args },
            });
          }

          contents.push({ role: "model", parts: callParts });
          contents.push({ role: "user", parts: responseParts });
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
