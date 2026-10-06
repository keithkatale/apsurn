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
import { CREATE_PLAN_TOOL } from "./plan";
import type { CopilotArtifact } from "./types";

export const CHAT_TURN_ROUNDS = 6;
/** Plan and wake-up turns do real multi-step work, so they get more rounds before handing over to plan_continue. */
export const BACKGROUND_TURN_ROUNDS = 16;
const HISTORY_ROWS = 120;

interface MessageRow {
  role: "user" | "model" | "tool";
  content: string;
  tool_name: string | null;
  tool_call_id: string | null;
  metadata: Record<string, unknown>;
}

export function buildResponsesInput(rows: MessageRow[]): ResponseInputItem[] {
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

export interface RunCopilotTurnOptions {
  db: SupabaseClient;
  userId: string;
  conversationId: string;
  send?: (payload: Record<string, unknown>) => void;
  isCancelled?: () => boolean;
  maxRounds?: number;
  deadlineAt?: number;
  /** The approved plan this turn executes, for budget accounting. */
  taskId?: string;
}

export interface CopilotTurnResult {
  finalText: string;
  artifacts: CopilotArtifact[];
  /** Every round ended in tool calls: the model never finished, so a plan turn should continue. */
  exhausted: boolean;
  cancelled: boolean;
  planned: boolean;
  approved: boolean;
}

type ToolRow = {
  conversation_id: string;
  role: "tool";
  tool_name: string;
  tool_call_id: string;
  content: string;
  metadata: { args: Record<string, unknown>; agent?: string; callId: string; parentCallId?: string };
};

function agentOf(name: string, args: Record<string, unknown>) {
  return name === "delegate_to_agent" && typeof args.agent === "string" ? args.agent : undefined;
}

export async function runCopilotTurn(options: RunCopilotTurnOptions): Promise<CopilotTurnResult> {
  const { db, userId, conversationId, taskId, deadlineAt } = options;
  const send = options.send ?? (() => {});

  // Newest rows win when a long conversation exceeds the window.
  const { data: historyDesc } = await db
    .from("copilot_messages")
    .select("role, content, tool_name, tool_call_id, metadata")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_ROWS);
  const input = buildResponsesInput(((historyDesc ?? []) as MessageRow[]).reverse());

  const { ai, model } = await getAiClient();
  const turnArtifacts: CopilotArtifact[] = [];
  const nestedToolRows: ToolRow[] = [];

  const loop = await runAgentLoop({
    ai,
    model,
    instructions: COPILOT_SYSTEM_INSTRUCTION,
    tools: COPILOT_TOOL_DECLARATIONS.map(toFunctionTool),
    input,
    maxRounds: options.maxRounds ?? CHAT_TURN_ROUNDS,
    thinkingBudget: ORCHESTRATION_THINKING_BUDGET,
    isCancelled: options.isCancelled,
    isParallelSafe: (name) => !COPILOT_MUTATING_TOOLS.has(name),
    stopAfterRound: (results) =>
      results.some(
        (done) =>
          (done.name === CREATE_PLAN_TOOL && (done.result as { planned?: boolean } | null)?.planned) ||
          (done.name === "approve_plan" && (done.result as { status?: string } | null)?.status === "queued"),
      ),
    onRoundStart: () => send({ type: "status", status: "thinking" }),
    onText: (delta) => send({ type: "reasoning", text: delta, agent: "copilot" }),
    onThought: (delta) => send({ type: "reasoning", text: delta, agent: "copilot" }),
    onToolStart: (call) => send({ type: "tool_start", id: call.id, name: call.name, args: call.args, agent: agentOf(call.name, call.args) }),
    onToolEnd: (done) =>
      send({ type: "tool_end", id: done.id, name: done.name, args: done.args, result: done.result, agent: agentOf(done.name, done.args) }),
    runTool: (call) =>
      runCopilotTool(
        {
          db,
          userId,
          conversationId,
          parentId: call.id,
          taskId,
          deadlineAt,
          isCancelled: options.isCancelled,
          emit: (event) => {
            send({ ...event });
            if (event.type === "artifact" && event.artifact) turnArtifacts.push(event.artifact);
            if (event.type === "tool_end" && event.parentId && event.name) {
              nestedToolRows.push({
                conversation_id: conversationId,
                role: "tool",
                tool_name: event.name,
                tool_call_id: event.id ?? event.name,
                content: JSON.stringify(event.result ?? {}).slice(0, 20000),
                metadata: { args: event.args ?? {}, agent: event.agent, callId: event.id ?? event.name, parentCallId: event.parentId },
              });
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
        metadata: { args: done.args, agent: agentOf(done.name, done.args), callId: done.id },
      }));
      if (toolRows.length > 0) await db.from("copilot_messages").insert(toolRows);
      if (nestedToolRows.length > 0) await db.from("copilot_messages").insert(nestedToolRows.splice(0));
    },
  });

  let finalText = loop.finalText;
  const planned = loop.toolResults.find((done) => done.name === CREATE_PLAN_TOOL && (done.result as { planned?: boolean } | null)?.planned);
  const approved = loop.toolResults.some((done) => done.name === "approve_plan" && (done.result as { status?: string } | null)?.status === "queued");
  if (planned) {
    const estimate = (planned.result as { estimate?: { low?: number; high?: number } }).estimate;
    finalText = `Here's the plan. It should cost about ${estimate?.low ?? "?"}–${estimate?.high ?? "?"} credits. Approve it and I'll work through it here, step by step.`;
  } else if (approved && !finalText.trim()) {
    finalText = "Approved — starting now. I'll work through the steps here and report as I go.";
  }
  if (!finalText.trim() && turnArtifacts.length > 0) finalText = "Done — the result is in the card below.";
  if (!finalText.trim() && loop.exhausted && !taskId) {
    finalText = "I ran out of steps for this turn before finishing. Tell me to keep going and I'll continue.";
  }
  if (finalText) send({ type: "answer", text: finalText });

  if (finalText.trim() || turnArtifacts.length > 0) {
    await db.from("copilot_messages").insert({
      conversation_id: conversationId,
      role: "model",
      content: finalText,
      metadata: { artifactIds: turnArtifacts.map((artifact) => artifact.id) },
    });
  }
  await db.from("copilot_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

  return { finalText, artifacts: turnArtifacts, exhausted: loop.exhausted, cancelled: loop.cancelled, planned: Boolean(planned), approved };
}
