import { GoogleGenAI } from "@google/genai";
import type { ResponseInputItem, Tool } from "openai/resources/responses/responses";

// Gemini, via Google's unified `@google/genai` SDK — which speaks either the
// plain Gemini Developer API (a flat API key, no GCP project/IAM at all) or
// full Vertex AI, through the exact same class.
//
// Auth is resolved in this order, cheapest/most-reliable first:
//   1. GEMINI_API_KEY (admin panel or env var) — the Gemini Developer API.
//      Just a key from https://aistudio.google.com/apikey, completely
//      decoupled from any GCP project, IAM role, or org policy. This is the
//      recommended path: it sidesteps the two dead ends already hit on this
//      project — personal ADC credentials need periodic interactive
//      browser re-auth ("invalid_grant"/RAPT) that a server can't perform,
//      and this GCP org's `iam.managed.disableServiceAccountKeyCreation`
//      policy blocks downloadable service-account keys entirely.
//   2. A service-account JSON key stored in the app (admin panel), for
//      projects where the org policy above isn't in effect and full Vertex
//      AI (billing tied to the GCP project, VPC-SC, etc.) is actually
//      wanted over the Developer API.
//   3. GOOGLE_SERVICE_ACCOUNT_JSON env var (same JSON, for deploys that
//      prefer an env-var secret over the admin-panel copy).
//   4. Application Default Credentials as a last resort (works if the
//      compute environment has a service account attached — e.g. Cloud Run
//      with `--service-account` — but will hit the RAPT failure above if
//      it's actually a personal `gcloud auth application-default login`).
//
// This file is a compatibility SHIM: it exposes just enough of the OpenAI
// Responses API surface (`.responses.create(...)`, both streaming and not)
// for our existing call sites to use unmodified, translating requests and
// responses to/from Gemini's own shapes underneath.

export function isVertexConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_CLOUD_PROJECT?.trim());
}

export function getVertexModel(): string {
  return process.env.VERTEX_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

/** Parses/validates a pasted service-account key without ever logging its contents. */
export function parseServiceAccountJson(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That doesn't look like valid JSON.");
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.type !== "service_account" || typeof obj.private_key !== "string" || typeof obj.client_email !== "string") {
    throw new Error('Not a service-account key — expected a JSON file with "type": "service_account".');
  }
  return obj;
}

function createGenAI(geminiApiKey: string | null, serviceAccountJson: string | null): GoogleGenAI {
  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY?.trim();
  if (apiKey) {
    return new GoogleGenAI({ apiKey });
  }

  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error("Gemini is not configured. Set GEMINI_API_KEY (recommended), or GOOGLE_CLOUD_PROJECT for Vertex AI.");
  }
  const location = process.env.GOOGLE_CLOUD_LOCATION?.trim() || "us-central1";

  const rawCredentials = serviceAccountJson || process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (rawCredentials) {
    try {
      const credentials = parseServiceAccountJson(rawCredentials);
      return new GoogleGenAI({ vertexai: true, project, location, googleAuthOptions: { credentials } });
    } catch (error) {
      // An explicitly-provided key that doesn't parse is a misconfiguration
      // worth shouting about — but it must not be fatal, because ADC below
      // is the correct path on Cloud Run (attached service account) and is
      // exactly how the reference "quant" project authenticates. Hard-
      // throwing here meant one bad env var took down every AI call.
      console.error(
        "[ai/vertex] GOOGLE_SERVICE_ACCOUNT_JSON / stored key is set but unusable — ignoring it and trying Application Default Credentials instead:",
        error instanceof Error ? error.message : error
      );
    }
  }

  // Application Default Credentials. On Cloud Run this resolves the service
  // account attached to the service (no key file, so no conflict with the
  // org policy that blocks key creation). Locally it uses `gcloud auth
  // application-default login`, which can go stale and need re-running.
  return new GoogleGenAI({ vertexai: true, project, location });
}

interface CreateParams {
  model: string;
  input: string | ResponseInputItem[];
  instructions?: string;
  max_output_tokens?: number;
  text?: { format?: { type?: string } };
  tools?: Tool[];
  stream?: boolean;
  /**
   * Gemini-only. Thinking tokens are drawn from the same budget as
   * max_output_tokens, so a tight cap with thinking on can return empty
   * text. 0 disables thinking (use for short JSON/label extraction);
   * omitted leaves Gemini's dynamic default. Stripped for other providers.
   */
  thinking_budget?: number;
}

interface CreateOptions {
  signal?: AbortSignal;
}

type GeminiPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
};
type GeminiChunk = { candidates?: Array<{ content?: { parts?: GeminiPart[] } }> };

function thinkingConfigOf(params: CreateParams): Record<string, unknown> | undefined {
  if (params.thinking_budget === undefined) return undefined;
  const thinkingBudget = Math.max(0, Math.floor(params.thinking_budget));
  return thinkingBudget > 0 ? { thinkingBudget, includeThoughts: true } : { thinkingBudget: 0 };
}

function usesWebSearch(tools: CreateParams["tools"]): boolean {
  return Array.isArray(tools) && tools.some((t) => t.type === "web_search");
}

function functionDeclarationsOf(tools: CreateParams["tools"]) {
  if (!Array.isArray(tools)) return undefined;
  const fnTools = tools.filter((t): t is Extract<Tool, { type: "function" }> => t.type === "function");
  if (fnTools.length === 0) return undefined;
  return fnTools.map((t) => ({ name: t.name, description: t.description ?? undefined, parameters: t.parameters ?? undefined }));
}

/** Converts our accumulated Responses-API input array into Gemini's Content[] shape. */
function convertInput(input: CreateParams["input"]): string | { role: string; parts: Record<string, unknown>[] }[] {
  if (typeof input === "string") return input;

  const callIdToName = new Map<string, string>();
  for (const item of input) {
    if ("type" in item && item.type === "function_call" && "call_id" in item && "name" in item) {
      callIdToName.set(item.call_id as string, item.name as string);
    }
  }

  const contents: { role: string; parts: Record<string, unknown>[] }[] = [];
  for (const item of input) {
    if ("role" in item && typeof (item as { content?: unknown }).content === "string") {
      const role = item.role === "assistant" ? "model" : "user";
      contents.push({ role, parts: [{ text: (item as { content: string }).content }] });
    } else if ("type" in item && item.type === "function_call") {
      const call = item as { name: string; arguments: string; thought_signature?: string };
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {
        // leave args empty if the model produced malformed JSON
      }
      // Newer Gemini thinking models reject a replayed function call that
      // lost the signature it was emitted with.
      const part: Record<string, unknown> = { functionCall: { name: call.name, args } };
      if (call.thought_signature) part.thoughtSignature = call.thought_signature;
      contents.push({ role: "model", parts: [part] });
    } else if ("type" in item && item.type === "function_call_output") {
      const out = item as { call_id: string; output: string };
      const name = callIdToName.get(out.call_id) ?? "unknown_function";
      let response: unknown = out.output;
      try {
        response = JSON.parse(out.output);
      } catch {
        response = { result: out.output };
      }
      contents.push({ role: "user", parts: [{ functionResponse: { name, response } }] });
    } else if ("type" in item && item.type === "message") {
      const message = item as { role?: string; content?: unknown };
      const content = message.content;
      const text = Array.isArray(content)
        ? content.map((c) => (typeof c === "object" && c && "text" in c ? String((c as { text: unknown }).text) : "")).join("")
        : "";
      if (text) contents.push({ role: message.role === "user" ? "user" : "model", parts: [{ text }] });
    }
  }
  return contents;
}

let callIdCounter = 0;
function nextCallId(): string {
  callIdCounter += 1;
  return `vertex_call_${Date.now()}_${callIdCounter}`;
}

async function createNonStreaming(genAI: GoogleGenAI, params: CreateParams) {
  const config: Record<string, unknown> = {};
  if (params.max_output_tokens) config.maxOutputTokens = params.max_output_tokens;
  if (params.text?.format?.type === "json_object") config.responseMimeType = "application/json";
  if (usesWebSearch(params.tools)) config.tools = [{ googleSearch: {} }];
  if (params.instructions) config.systemInstruction = params.instructions;
  const thinkingConfig = thinkingConfigOf(params);
  if (thinkingConfig) config.thinkingConfig = { ...thinkingConfig, includeThoughts: false };

  const response = await genAI.models.generateContent({
    model: params.model,
    contents: convertInput(params.input),
    config,
  });

  return { output_text: response.text ?? "" };
}

async function* createStreaming(genAI: GoogleGenAI, params: CreateParams, options?: CreateOptions) {
  const config: Record<string, unknown> = {};
  if (params.instructions) config.systemInstruction = params.instructions;
  if (params.max_output_tokens) config.maxOutputTokens = params.max_output_tokens;
  const thinkingConfig = thinkingConfigOf(params);
  if (thinkingConfig) config.thinkingConfig = thinkingConfig;
  const functionDeclarations = functionDeclarationsOf(params.tools);
  if (functionDeclarations) config.tools = [{ functionDeclarations }];
  else if (usesWebSearch(params.tools)) config.tools = [{ googleSearch: {} }];

  const stream = await genAI.models.generateContentStream({
    model: params.model,
    contents: convertInput(params.input),
    config,
  });

  let textAccum = "";
  const calls: { callId: string; name: string; args: Record<string, unknown>; thoughtSignature?: string }[] = [];

  try {
    for await (const chunk of stream as AsyncIterable<GeminiChunk>) {
      if (options?.signal?.aborted) throw new Error("Request aborted");
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (part.functionCall?.name) {
          calls.push({
            callId: nextCallId(),
            name: part.functionCall.name,
            args: part.functionCall.args ?? {},
            thoughtSignature: part.thoughtSignature,
          });
        } else if (part.text && part.thought) {
          yield { type: "response.reasoning_summary_text.delta", delta: part.text };
        } else if (part.text) {
          textAccum += part.text;
          yield { type: "response.output_text.delta", delta: part.text };
        }
      }
    }
  } catch (error) {
    yield { type: "error", message: error instanceof Error ? error.message : "Vertex stream failed" };
    return;
  }

  const output: unknown[] = [];
  if (textAccum) {
    output.push({ type: "message", role: "assistant", content: [{ type: "output_text", text: textAccum }] });
  }
  for (const call of calls) {
    output.push({
      type: "function_call",
      call_id: call.callId,
      name: call.name,
      arguments: JSON.stringify(call.args),
      ...(call.thoughtSignature ? { thought_signature: call.thoughtSignature } : {}),
    });
  }

  yield { type: "response.completed", response: { output } };
}

/**
 * The underlying Gemini client, un-shimmed.
 *
 * Web search (src/lib/search/web-search.ts) needs `groundingMetadata` off the
 * raw response — the real sources Google Search returned — which the
 * Responses-API shape below deliberately discards. Reading URLs out of the
 * model's prose instead is what produced fabricated links.
 */
export function createVertexAiClientRaw(geminiApiKey: string | null = null, serviceAccountJson: string | null = null): GoogleGenAI {
  return createGenAI(geminiApiKey, serviceAccountJson);
}

/** A minimal object shaped like the OpenAI SDK client, backed by Vertex/Gemini, for use anywhere `createAiClient()` is called. */
export function createVertexAiClient(geminiApiKey: string | null = null, serviceAccountJson: string | null = null) {
  const genAI = createGenAI(geminiApiKey, serviceAccountJson);
  return {
    responses: {
      create(params: CreateParams, options?: CreateOptions) {
        if (params.stream) return Promise.resolve(createStreaming(genAI, params, options));
        return createNonStreaming(genAI, params);
      },
    },
  };
}
