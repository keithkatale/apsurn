import type { ResponseInputItem, Tool } from "openai/resources/responses/responses";

// Claude, via Anthropic's Messages API, behind the same small `.responses.create(...)`
// surface the rest of the app already uses (see openai.ts / vertex.ts). Plain fetch, no SDK:
// requests and responses are translated to and from Anthropic's shapes here, so no call site changes.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
/** Anthropic requires max_tokens on every request; call sites that don't set one get this. */
const DEFAULT_MAX_TOKENS = 4096;

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

interface CreateParams {
  model: string;
  input: string | ResponseInputItem[];
  instructions?: string;
  max_output_tokens?: number;
  text?: { format?: { type?: string } };
  tools?: Tool[];
  stream?: boolean;
  /** Gemini-only knob; ignored here. */
  thinking_budget?: number;
}

interface CreateOptions {
  signal?: AbortSignal;
}

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string };
type Block = TextBlock | ToolUseBlock | ToolResultBlock;
interface Message {
  role: "user" | "assistant";
  content: Block[];
}

/** Anthropic only accepts ids made of letters, digits, underscore and hyphen. */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "call";
}

/**
 * Our accumulated Responses-style input → Anthropic messages. Roles must alternate, so neighbours with the
 * same role are merged, and tool results go first inside a user turn (Anthropic requires that order).
 */
export function convertInput(input: CreateParams["input"]): Message[] {
  if (typeof input === "string") return [{ role: "user", content: [{ type: "text", text: input }] }];

  const raw: Message[] = [];
  for (const item of input) {
    if ("role" in item && typeof (item as { content?: unknown }).content === "string") {
      const text = (item as { content: string }).content;
      if (!text.trim()) continue;
      raw.push({ role: item.role === "assistant" ? "assistant" : "user", content: [{ type: "text", text }] });
    } else if ("type" in item && item.type === "function_call") {
      const call = item as { call_id: string; name: string; arguments: string };
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {
        // malformed arguments from an earlier turn: replay as empty
      }
      raw.push({ role: "assistant", content: [{ type: "tool_use", id: safeId(call.call_id), name: call.name, input: args }] });
    } else if ("type" in item && item.type === "function_call_output") {
      const out = item as { call_id: string; output: string };
      raw.push({ role: "user", content: [{ type: "tool_result", tool_use_id: safeId(out.call_id), content: out.output || "{}" }] });
    } else if ("type" in item && item.type === "message") {
      const message = item as { role?: string; content?: unknown };
      const text = Array.isArray(message.content)
        ? message.content.map((c) => (typeof c === "object" && c && "text" in c ? String((c as { text: unknown }).text) : "")).join("")
        : "";
      if (text.trim()) raw.push({ role: message.role === "user" ? "user" : "assistant", content: [{ type: "text", text }] });
    }
  }

  const merged: Message[] = [];
  for (const message of raw) {
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) last.content.push(...message.content);
    else merged.push({ role: message.role, content: [...message.content] });
  }
  for (const message of merged) {
    if (message.role === "user") message.content.sort((a, b) => Number(b.type === "tool_result") - Number(a.type === "tool_result"));
  }
  // A conversation has to open with the user.
  if (merged.length === 0 || merged[0].role !== "user") {
    merged.unshift({ role: "user", content: [{ type: "text", text: "(start of conversation)" }] });
  }
  return merged;
}

function toolsOf(tools: CreateParams["tools"]) {
  if (!Array.isArray(tools)) return undefined;
  const out: Array<Record<string, unknown>> = [];
  for (const tool of tools) {
    if (tool.type === "function") {
      out.push({
        name: tool.name,
        description: tool.description ?? undefined,
        input_schema: tool.parameters ?? { type: "object", properties: {} },
      });
    } else if (tool.type === "web_search") {
      // Anthropic's server-side web search; the model runs the searches itself.
      out.push({ type: "web_search_20250305", name: "web_search", max_uses: 5 });
    }
  }
  return out.length ? out : undefined;
}

function requestBody(params: CreateParams, stream: boolean) {
  const wantsJson = params.text?.format?.type === "json_object";
  const system = [params.instructions, wantsJson ? "Respond with a single valid JSON value and nothing else: no prose, no markdown fences." : ""]
    .filter(Boolean)
    .join("\n\n");
  return {
    model: params.model,
    max_tokens: params.max_output_tokens && params.max_output_tokens > 0 ? params.max_output_tokens : DEFAULT_MAX_TOKENS,
    messages: convertInput(params.input),
    ...(system ? { system } : {}),
    ...(toolsOf(params.tools) ? { tools: toolsOf(params.tools) } : {}),
    ...(stream ? { stream: true } : {}),
  };
}

async function post(params: CreateParams, stream: boolean, options?: CreateOptions): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error("Claude is selected as the AI provider but ANTHROPIC_API_KEY is empty. Add the key to .env.local (or the Cloud Run service) and restart.");
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
    body: JSON.stringify(requestBody(params, stream)),
    signal: options?.signal,
  });
  if (!response.ok) {
    // Never echo the request (it carries the key); keep Anthropic's short reason only.
    let reason = "";
    try {
      const body = (await response.json()) as { error?: { type?: string; message?: string } };
      reason = body.error?.message ?? "";
      throw Object.assign(new Error(reason || `Anthropic request failed (HTTP ${response.status})`), { status: response.status, type: body.error?.type });
    } catch (error) {
      if ((error as { status?: number }).status) throw error;
      throw Object.assign(new Error(`Anthropic request failed (HTTP ${response.status})`), { status: response.status });
    }
  }
  return response;
}

async function createNonStreaming(params: CreateParams, options?: CreateOptions) {
  const response = await post(params, false, options);
  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  let output_text = (data.content ?? []).filter((block) => block.type === "text").map((block) => block.text ?? "").join("");
  // Claude likes to wrap JSON in a code fence even when told not to; callers asked for bare JSON.
  if (params.text?.format?.type === "json_object") output_text = output_text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  return { output_text };
}

async function* createStreaming(params: CreateParams, options?: CreateOptions) {
  let response: Response;
  try {
    response = await post(params, true, options);
  } catch (error) {
    yield { type: "error", message: error instanceof Error ? error.message : "Anthropic request failed" };
    return;
  }
  if (!response.body) {
    yield { type: "error", message: "Anthropic returned no stream" };
    return;
  }

  let text = "";
  const calls = new Map<number, { id: string; name: string; json: string }>();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        let event: {
          type?: string;
          index?: number;
          content_block?: { type?: string; id?: string; name?: string };
          delta?: { type?: string; text?: string; partial_json?: string };
          error?: { message?: string };
        };
        try {
          event = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        if (event.type === "content_block_start" && event.content_block?.type === "tool_use" && typeof event.index === "number") {
          calls.set(event.index, { id: event.content_block.id ?? `call_${event.index}`, name: event.content_block.name ?? "", json: "" });
        } else if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
          text += event.delta.text;
          yield { type: "response.output_text.delta", delta: event.delta.text };
        } else if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta" && typeof event.index === "number") {
          const call = calls.get(event.index);
          if (call) call.json += event.delta.partial_json ?? "";
        } else if (event.type === "error") {
          yield { type: "error", message: event.error?.message ?? "Anthropic stream failed" };
          return;
        }
      }
    }
  } catch (error) {
    yield { type: "error", message: error instanceof Error ? error.message : "Anthropic stream failed" };
    return;
  }

  const output: unknown[] = [];
  if (text) output.push({ type: "message", role: "assistant", content: [{ type: "output_text", text }] });
  for (const call of calls.values()) {
    output.push({ type: "function_call", call_id: call.id, name: call.name, arguments: call.json || "{}" });
  }
  yield { type: "response.completed", response: { output } };
}

/** A minimal object shaped like the OpenAI SDK client, backed by Claude. */
export function createAnthropicClient() {
  return {
    responses: {
      create(params: CreateParams, options?: CreateOptions) {
        if (params.stream) return Promise.resolve(createStreaming(params, options));
        return createNonStreaming(params, options);
      },
    },
  };
}
