/**
 * The one model ↔ tools loop shared by the Copilot chat route, specialist
 * delegation, and the durable task executor. Callers own persistence and
 * event fan-out through hooks; this file only owns the loop mechanics.
 *
 * Deliberately has no runtime `@/` imports so it can be unit-tested under
 * `node --experimental-strip-types` (see loop.test.ts).
 */
import type { ResponseFunctionToolCall, ResponseInputItem, ResponseOutputItem, Tool } from "openai/resources/responses/responses";
import type { AiClient } from "../ai/openai";

/** Thinking for orchestration turns that pick tools and plan; extraction calls should pass 0. */
export const ORCHESTRATION_THINKING_BUDGET = 1024;

export interface LoopToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface LoopToolResult extends LoopToolCall {
  result: unknown;
}

export interface RunAgentLoopOptions {
  ai: AiClient;
  model: string;
  instructions: string;
  tools: Tool[];
  /** Mutated in place: model output items and tool outputs are appended, so the caller can keep using it. */
  input: ResponseInputItem[];
  maxRounds: number;
  thinkingBudget?: number;
  runTool: (call: LoopToolCall) => Promise<unknown>;
  /** Read-only tools can run concurrently; anything that writes runs in model order. */
  isParallelSafe: (name: string) => boolean;
  /** Lets a caller rewrite args before execution (e.g. carrying an upstream confirmation). */
  prepareArgs?: (call: LoopToolCall) => Record<string, unknown>;
  isCancelled?: () => boolean;
  onRoundStart?: (round: number) => void;
  onText?: (delta: string) => void;
  onThought?: (delta: string) => void;
  onToolStart?: (call: LoopToolCall) => void;
  onToolEnd?: (result: LoopToolResult) => void;
  /** Called after each round's tool calls finish. Persist checkpoints here. */
  onRoundEnd?: (results: LoopToolResult[]) => Promise<void> | void;
  /** End the loop after this round without another model call (e.g. a plan now awaits user approval). */
  stopAfterRound?: (results: LoopToolResult[]) => boolean;
  /**
   * Called when a round produced text and no tool calls. Return true to keep
   * looping (the caller should have pushed a nudge onto `input`).
   */
  onTextOnlyRound?: (text: string, toolResults: LoopToolResult[]) => Promise<boolean> | boolean;
}

export interface RunAgentLoopResult {
  finalText: string;
  toolResults: LoopToolResult[];
  cancelled: boolean;
  /** Every round ended in tool calls — the model never wrote a final answer. */
  exhausted: boolean;
}

/** Tool-call arguments are model output; malformed JSON must reach the model as an error, not crash the turn. */
export function safeParseArgs(raw: string | undefined | null): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw || !raw.trim()) return { ok: true, args: {} };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { ok: true, args: parsed as Record<string, unknown> };
    return { ok: false, error: "Tool arguments must be a JSON object." };
  } catch {
    return { ok: false, error: "Tool arguments were not valid JSON. Re-issue the call with a valid JSON object." };
  }
}

/** A round runs concurrently only when every call in it is read-only. */
export function canRunInParallel(names: string[], isParallelSafe: (name: string) => boolean): boolean {
  return names.length > 1 && names.every(isParallelSafe);
}

async function executeCall(call: LoopToolCall, options: RunAgentLoopOptions): Promise<LoopToolResult> {
  options.onToolStart?.(call);
  let result: unknown;
  try {
    result = await options.runTool(call);
  } catch (error) {
    result = { error: error instanceof Error ? error.message : "Tool failed" };
  }
  const done = { ...call, result };
  options.onToolEnd?.(done);
  return done;
}

export async function runAgentLoop(options: RunAgentLoopOptions): Promise<RunAgentLoopResult> {
  const { ai, model, instructions, tools, input, maxRounds } = options;
  const toolResults: LoopToolResult[] = [];

  for (let round = 0; round < maxRounds; round++) {
    if (options.isCancelled?.()) return { finalText: "", toolResults, cancelled: true, exhausted: false };
    options.onRoundStart?.(round);

    let roundText = "";
    let outputItems: ResponseOutputItem[] = [];
    const responseStream = await ai.responses.create({
      model,
      input,
      instructions,
      tools,
      stream: true,
      ...(options.thinkingBudget !== undefined ? { thinking_budget: options.thinkingBudget } : {}),
    });

    for await (const event of responseStream) {
      const type = event.type as string;
      if (type === "response.output_text.delta") {
        roundText += event.delta;
        options.onText?.(event.delta);
      } else if (type === "response.reasoning_summary_text.delta" || type === "response.reasoning.delta") {
        const delta = "delta" in event && typeof event.delta === "string" ? event.delta : "";
        if (delta) options.onThought?.(delta);
      } else if (type === "response.completed") {
        outputItems = event.response.output;
      } else if (type === "error") {
        throw new Error(event.message);
      }
    }

    for (const item of outputItems) input.push(item as ResponseInputItem);
    const rawCalls = outputItems.filter((item): item is ResponseFunctionToolCall => item.type === "function_call");

    if (rawCalls.length === 0) {
      if (options.onTextOnlyRound && (await options.onTextOnlyRound(roundText, toolResults))) continue;
      return { finalText: roundText, toolResults, cancelled: false, exhausted: false };
    }

    // Bad JSON goes straight back to the model as that call's output.
    const runnable: LoopToolCall[] = [];
    const roundResults: LoopToolResult[] = [];
    for (const raw of rawCalls) {
      const parsed = safeParseArgs(raw.arguments);
      if (!parsed.ok) {
        const failed = { id: raw.call_id, name: raw.name, args: {}, result: { error: parsed.error } };
        options.onToolStart?.(failed);
        options.onToolEnd?.(failed);
        roundResults.push(failed);
        continue;
      }
      const call = { id: raw.call_id, name: raw.name, args: parsed.args };
      runnable.push({ ...call, args: options.prepareArgs?.(call) ?? call.args });
    }

    if (canRunInParallel(runnable.map((call) => call.name), options.isParallelSafe)) {
      roundResults.push(...(await Promise.all(runnable.map((call) => executeCall(call, options)))));
    } else {
      for (const call of runnable) {
        if (options.isCancelled?.()) break;
        roundResults.push(await executeCall(call, options));
      }
    }

    // Outputs go back in the model's original call order.
    const byId = new Map(roundResults.map((result) => [result.id, result]));
    for (const raw of rawCalls) {
      const result = byId.get(raw.call_id);
      input.push({
        type: "function_call_output",
        call_id: raw.call_id,
        output: JSON.stringify(result ? result.result : { error: "Cancelled before this tool ran." }),
      });
    }
    toolResults.push(...roundResults);
    await options.onRoundEnd?.(roundResults);
    if (options.stopAfterRound?.(roundResults)) return { finalText: "", toolResults, cancelled: false, exhausted: false };
  }

  return { finalText: "", toolResults, cancelled: false, exhausted: true };
}
