import { createChatGenAI, getVertexModel } from "@/lib/ai/vertex";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { COPILOT_SYSTEM_INSTRUCTION, COPILOT_TOOL_DECLARATIONS, runCopilotTool } from "@/lib/copilot/tools";
import { toolLabel, toolPhase } from "@/lib/agents/labels";
import type { AgentToolContext } from "@/lib/agents/types";
import { createAdminClient } from "@/lib/supabase/admin";

type ChatMessage = {
  role: "user" | "model";
  text: string;
};

type ChatBody = {
  message?: string;
  history?: ChatMessage[];
  conversationId?: string;
};

type Content = {
  role: string;
  parts: Record<string, unknown>[];
};

type StreamEvent =
  | { type: "status"; step: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown>; step: string }
  | { type: "tool_done"; name: string; step: string }
  | { type: "artifact"; artifact: Record<string, unknown> }
  | { type: "reply"; text: string; model: string; artifacts?: Record<string, unknown>[] }
  | { type: "conversation"; id: string }
  | { type: "error"; error: string }
  | { type: "done" };

function formatLeadTableToMarkdown(artifact: Record<string, unknown>): string {
  const payload = artifact.payload as Record<string, unknown> | undefined;
  if (!payload) return "";
  let rows: Array<Record<string, unknown>> = [];
  if (Array.isArray(payload.rows)) {
    rows = payload.rows as Array<Record<string, unknown>>;
  } else if (Array.isArray(payload.blocks)) {
    const tableBlock = (payload.blocks as Array<{ type?: string; rows?: unknown[] }>).find((b) => b.type === "table");
    if (tableBlock && Array.isArray(tableBlock.rows)) {
      rows = tableBlock.rows as Array<Record<string, unknown>>;
    }
  }
  if (rows.length === 0) return "";

  const isCommercial = rows.some((r) => r.phone || r.location);
  if (isCommercial) {
    let md = "\n\n| Company | Location | Contact / Title | Phone / Email | Lead Type / Signal |\n";
    md += "| :--- | :--- | :--- | :--- | :--- |\n";
    for (const r of rows.slice(0, 50)) {
      const company = String(r.companyName || r.company || "Unknown");
      const location = String(r.location || "-");
      const contact = [r.fullName || r.name, r.title].filter(Boolean).join(" - ") || "-";
      const contactInfo = [r.phone, r.email].filter(Boolean).join(" / ") || "-";
      const signal = String(r.description || r.signal || r.source || "-");
      md += `| **${company}** | ${location} | ${contact} | ${contactInfo} | ${signal} |\n`;
    }
    return md;
  }

  let md = "\n\n| Company | Domain | Contact / Role | Source / Intent | Signal Reason |\n";
  md += "| :--- | :--- | :--- | :--- | :--- |\n";
  for (const r of rows.slice(0, 50)) {
    const company = String(r.companyName || r.company || "Unknown");
    const domain = r.domain ? `[${r.domain}](https://${r.domain})` : "-";
    const contact = [r.fullName || r.name, r.title].filter(Boolean).join(" - ") || "Founder / Team";
    const source = String(r.source || "Organic Signal");
    const reason = String(r.description || r.reason || r.signal || "High intent match");
    md += `| **${company}** | ${domain} | ${contact} | ${source} | ${reason} |\n`;
  }
  return md;
}

function sse(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function extractFunctionCalls(parts: Record<string, unknown>[]): Array<{
  name: string;
  args: Record<string, unknown>;
  thoughtSignature?: string;
}> {
  const calls: Array<{ name: string; args: Record<string, unknown>; thoughtSignature?: string }> = [];
  let carried: string | undefined;

  for (const part of parts) {
    const signature =
      typeof part.thoughtSignature === "string" && part.thoughtSignature ? part.thoughtSignature : undefined;
    const fc = part.functionCall as { name?: string; args?: Record<string, unknown> } | undefined;
    if (fc?.name) {
      calls.push({
        name: fc.name,
        args: fc.args ?? {},
        thoughtSignature: signature ?? carried,
      });
      carried = undefined;
    } else if (signature) {
      const unsigned = calls.find((c) => !c.thoughtSignature);
      if (unsigned) unsigned.thoughtSignature = signature;
      else carried = signature;
    }
  }

  return calls;
}

function serializeToolResult(result: unknown): Record<string, unknown> {
  if (result == null) return { result: null };
  if (typeof result === "string") return { result };
  if (typeof result === "object") return result as Record<string, unknown>;
  return { result };
}

async function ensureConversation(db: ReturnType<typeof createAdminClient>, userId: string, incomingId?: string | null) {
  if (incomingId) {
    const { data: existing } = await db
      .from("copilot_conversations")
      .select("id")
      .eq("id", incomingId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing?.id) return existing.id as string;
  }

  const { data: created, error } = await db
    .from("copilot_conversations")
    .insert({ user_id: userId, title: null })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Failed to start chat");
  return created.id as string;
}

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw error;
  }

  let body: ChatBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message = body.message?.trim();
  if (!message) {
    return new Response(JSON.stringify({ error: "message is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createAdminClient();
  let conversationId: string;
  try {
    conversationId = await ensureConversation(db, userId, body.conversationId);
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Failed to start chat" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const history = Array.isArray(body.history) ? body.history : [];
  const contents: Content[] = [
    ...history
      .filter((m) => m?.text?.trim() && (m.role === "user" || m.role === "model"))
      .map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      })),
    { role: "user", parts: [{ text: message }] },
  ];

  const encoder = new TextEncoder();
  const model = getVertexModel();
  const functionDeclarations = COPILOT_TOOL_DECLARATIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  })) as never[];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(sse(event)));

      try {
        send({ type: "conversation", id: conversationId });
        const ai = createChatGenAI();
        send({ type: "status", step: "Reading your message" });

        const maxTurns = 12;
        let finalText = "";

        const turnArtifacts: Record<string, unknown>[] = [];
        const ctx: AgentToolContext = {
          db,
          userId,
          conversationId,
          progress: (patch) => {
            const stage = typeof patch.stage === "string" ? patch.stage : null;
            const query = typeof patch.query === "string" ? patch.query : null;
            if (stage === "searching" && query) send({ type: "status", step: `Searching for “${query.slice(0, 60)}”` });
            else if (stage) send({ type: "status", step: stage });
          },
          emit: (event) => {
            if (event.type === "artifact" && event.artifact) {
              const art = event.artifact as unknown as Record<string, unknown>;
              turnArtifacts.push(art);
              send({ type: "artifact", artifact: art });
            }
          },
        };

        for (let turn = 0; turn < maxTurns; turn++) {
          send({
            type: "status",
            step: turn === 0 ? "Calling Gemini" : "Continuing after tools",
          });

          const response = await ai.models.generateContent({
            model,
            contents,
            config: {
              systemInstruction: COPILOT_SYSTEM_INSTRUCTION,
              tools: [{ functionDeclarations }],
            },
          });

          const parts = (response.candidates?.[0]?.content?.parts ?? []) as Record<string, unknown>[];
          const calls = extractFunctionCalls(parts);
          const textParts = parts
            .filter((p) => typeof p.text === "string" && !p.thought)
            .map((p) => String(p.text));
          const thoughtParts = parts
            .filter((p) => p.thought && typeof p.text === "string")
            .map((p) => String(p.text).trim())
            .filter(Boolean);

          for (const thought of thoughtParts) {
            const snippet = thought.length > 120 ? `${thought.slice(0, 117)}…` : thought;
            send({ type: "status", step: `Reasoning: ${snippet}` });
          }

          if (calls.length === 0 && turn === 0) {
            const isLeadQuery =
              /\b(find|source|generate|get|look for|discover|search for)\b.*\b(leads?|prospects?|companies|icp)\b/i.test(message) ||
              /\b(leads?|prospects?|companies)\b.*\b(icp|match|find|source)\b/i.test(message);

            if (isLeadQuery) {
              const isCommercial = /\b(commercial|real estate|property|properties|contractors?|permits?)\b/i.test(message);
              calls.push({
                name: isCommercial ? "generate_commercial_leads" : "run_signal_radar",
                args: isCommercial ? { leadType: "all", limit: 100 } : { limit: 100 },
              });
            }
          }

          if (calls.length > 0) {
            contents.push({ role: "model", parts });

            const functionResponses: Record<string, unknown>[] = [];
            for (const call of calls) {
              send({
                type: "tool_start",
                name: call.name,
                args: call.args,
                step: toolPhase(call.name, call.args),
              });

              let result: unknown;
              try {
                result = await runCopilotTool(ctx, call.name, call.args);
              } catch (err) {
                result = { error: err instanceof Error ? err.message : "tool failed" };
              }

              send({
                type: "tool_done",
                name: call.name,
                step: toolLabel(call.name),
              });

              functionResponses.push({
                functionResponse: {
                  name: call.name,
                  response: serializeToolResult(result),
                },
              });
            }

            contents.push({ role: "user", parts: functionResponses });
            continue;
          }

          finalText = response.text?.trim() || textParts.join("").trim();
          if (finalText) {
            const leadArtifact = turnArtifacts.find(
              (a) => a.kind === "lead_table" || (a.payload as { rows?: unknown[] } | undefined)?.rows,
            );
            if (leadArtifact && !finalText.includes("|")) {
              const tableMd = formatLeadTableToMarkdown(leadArtifact);
              if (tableMd) {
                finalText = `${finalText.trim()}${tableMd}`;
              }
            }
            send({ type: "status", step: "Drafting a reply" });
            send({ type: "reply", text: finalText, model, artifacts: turnArtifacts });
            send({ type: "done" });
            return;
          }

          send({ type: "error", error: "Empty model response" });
          send({ type: "done" });
          return;
        }

        send({ type: "error", error: "Too many tool rounds without a final answer" });
        send({ type: "done" });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Chat request failed";
        console.error("[api/chat]", detail);
        send({ type: "error", error: detail });
        send({ type: "done" });
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
