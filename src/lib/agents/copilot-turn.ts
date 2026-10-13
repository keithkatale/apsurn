/**
 * One Copilot turn: load the conversation, run the agent loop, persist every
 * round. Shared by the streaming chat route (user messages) and the background
 * job (run finished, plan approved), so a turn behaves the same wherever it
 * runs. `send` is optional — headless turns persist and the client polls.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResponseInputItem } from "openai/resources/responses/responses";
import { getAiClient, toFunctionTool } from "@/lib/ai/openai";
import { COPILOT_SYSTEM_INSTRUCTION, COPILOT_TOOL_DECLARATIONS, runCopilotTool } from "@/lib/copilot/tools";
import { COPILOT_MUTATING_TOOLS } from "./copilot";
import { ORCHESTRATION_THINKING_BUDGET, runAgentLoop } from "./loop";
import { toolPhase } from "./labels";
import { resultError } from "./run-events";
import type { RunSink } from "./run-sink";
import type { CopilotArtifact } from "./types";

export const CHAT_TURN_ROUNDS = 1000;
/** Turns that run in the background (the normal case now) get room for a long research chain. */
export const BACKGROUND_TURN_ROUNDS = 1000;
const HISTORY_ROWS = 80;
/** Tool results older than this many tool rows are cut to a short stub: the model needs to know what happened, not re-read every page. */
const RECENT_TOOL_ROWS = 8;
const OLD_TOOL_CHARS = 700;
const RECENT_TOOL_CHARS = 6000;

interface MessageRow {
  role: "user" | "model" | "tool";
  content: string;
  tool_name: string | null;
  tool_call_id: string | null;
  metadata: Record<string, unknown>;
}

function trimToolOutput(content: string, limit: number): string {
  return content.length > limit ? `${content.slice(0, limit)}… [trimmed]` : content;
}

export function buildResponsesInput(rows: MessageRow[]): ResponseInputItem[] {
  const input: ResponseInputItem[] = [];
  // Every extra thousand characters is read again on every round of the turn; keep old tool output short.
  const toolIndexes = rows.map((row, index) => (row.role === "tool" ? index : -1)).filter((index) => index >= 0);
  const recent = new Set(toolIndexes.slice(-RECENT_TOOL_ROWS));
  for (const [index, row] of rows.entries()) {
    if (row.role === "user") {
      input.push({ role: "user", content: row.content });
    } else if (row.role === "model") {
      if (row.content) input.push({ role: "assistant", content: row.content });
    } else if (row.role === "tool" && row.tool_name && row.tool_call_id) {
      const args = (row.metadata?.args as Record<string, unknown>) ?? {};
      input.push({ type: "function_call", call_id: row.tool_call_id, name: row.tool_name, arguments: JSON.stringify(args) });
      input.push({ type: "function_call_output", call_id: row.tool_call_id, output: trimToolOutput(row.content, recent.has(index) ? RECENT_TOOL_CHARS : OLD_TOOL_CHARS) });
    }
  }
  return input;
}

export interface RunCopilotTurnOptions {
  db: SupabaseClient;
  userId: string;
  conversationId: string;
  /** Where progress goes. The chat follows it live and replays it after a reload. */
  sink?: RunSink;
  isCancelled?: () => boolean;
  maxRounds?: number;
  deadlineAt?: number;
  /** The approved plan this turn executes, for budget accounting. */
  taskId?: string;
}

export interface CopilotTurnResult {
  finalText: string;
  artifacts: CopilotArtifact[];
  /** Every round ended in tool calls: the model never finished. */
  exhausted: boolean;
  cancelled: boolean;
}

type ToolRow = {
  conversation_id: string;
  role: "tool";
  tool_name: string;
  tool_call_id: string;
  content: string;
  metadata: { args: Record<string, unknown>; callId: string };
};

export async function runCopilotTurn(options: RunCopilotTurnOptions): Promise<CopilotTurnResult> {
  const { db, userId, conversationId, taskId, deadlineAt, sink } = options;
  const cancelled = () => Boolean(options.isCancelled?.() || sink?.isCancelled());

  // Newest rows win when a long conversation exceeds the window.
  const { data: historyDesc } = await db
    .from("copilot_messages")
    .select("role, content, tool_name, tool_call_id, metadata")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_ROWS);
  const input = buildResponsesInput(((historyDesc ?? []) as MessageRow[]).reverse());

  sink?.status("Thinking…");
  const { ai, model } = await getAiClient();
  const turnArtifacts: CopilotArtifact[] = [];

  const loop = await runAgentLoop({
    ai,
    model,
    instructions: COPILOT_SYSTEM_INSTRUCTION,
    tools: COPILOT_TOOL_DECLARATIONS.map(toFunctionTool),
    input,
    maxRounds: options.maxRounds ?? CHAT_TURN_ROUNDS,
    deadlineAt,
    // Web search retries once and can take most of a minute; leave room for that.
    toolTimeoutMs: 120_000,
    thinkingBudget: ORCHESTRATION_THINKING_BUDGET,
    isCancelled: cancelled,
    isParallelSafe: (name) => !COPILOT_MUTATING_TOOLS.has(name),
    onRoundStart: (round) => sink?.status(round === 0 ? "Thinking…" : "Reading the results…"),
    onText: (delta) => sink?.text(delta),
    onThought: (delta) => sink?.reasoning(delta),
    onToolStart: (call) => {
      sink?.toolStart(call.id, call.name, call.args);
      sink?.status(toolPhase(call.name, call.args));
    },
    onToolEnd: (done) => {
      const error = resultError(done.result);
      sink?.toolEnd(done.id, { ok: !error, result: done.result, error: error ?? undefined });
    },
    runTool: (call, signal) =>
      runCopilotTool(
        {
          db,
          userId,
          conversationId,
          parentId: call.id,
          taskId,
          deadlineAt,
          isCancelled: cancelled,
          signal,
          progress: (patch) => sink?.toolProgress(call.id, patch),
          emit: (event) => {
            if (event.type === "artifact" && event.artifact) {
              turnArtifacts.push(event.artifact);
              sink?.artifact(event.artifact as unknown as Record<string, unknown>);
            }
          },
        },
        call.name,
        call.args,
      ),
    onRoundEnd: async (results) => {
      const toolRows: ToolRow[] = results.map((done) => ({
        conversation_id: conversationId,
        role: "tool",
        tool_name: done.name,
        tool_call_id: done.id,
        content: JSON.stringify(done.result).slice(0, 20000),
        metadata: { args: done.args, callId: done.id },
      }));
      if (toolRows.length > 0) await db.from("copilot_messages").insert(toolRows);
    },
  });

  let finalText = loop.finalText;
  if (!finalText.trim() && !loop.cancelled) {
    const fallback = turnArtifacts.length > 0 ? "Done — the result is in the card above." : "";
    if (fallback) {
      finalText = fallback;
      sink?.text(fallback);
    }
  }

  // Out of time (not out of work): a continuation picks the same run up and writes the one saved message at the end.
  if (loop.exhausted && !loop.cancelled && sink) return { finalText, artifacts: turnArtifacts, exhausted: true, cancelled: false };

  const timeline = sink?.timeline() ?? [];
  if (finalText.trim() || turnArtifacts.length > 0 || timeline.length > 0) {
    await db.from("copilot_messages").insert({
      conversation_id: conversationId,
      role: "model",
      content: finalText,
      metadata: { artifactIds: turnArtifacts.map((artifact) => artifact.id), ...(timeline.length > 0 ? { timeline, runId: sink?.runId } : {}) },
    });
  }
  await db.from("copilot_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

  return { finalText, artifacts: turnArtifacts, exhausted: loop.exhausted, cancelled: loop.cancelled };
}
