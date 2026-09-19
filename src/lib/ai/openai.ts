import OpenAI from "openai";
import type { Tool } from "openai/resources/responses/responses";
import { getActiveProvider, getGeminiApiKey, getVertexServiceAccountJson } from "./settings";
import { createVertexAiClient, getVertexModel, isVertexConfigured } from "./vertex";

// The app can route through OpenAI, OpenRouter, or Vertex AI/Gemini,
// switchable at runtime from the admin panel (see src/lib/ai/settings.ts).
// OpenAI and OpenRouter both speak the real OpenAI Responses API, so they
// share one code path here (just a different baseURL/key/model). Vertex is
// structurally different under the hood (a separate Google SDK) but exposes
// the same `.responses.create(...)` surface via the adapter in vertex.ts, so
// every call site in the app stays provider-agnostic.
const OPENROUTER_DEFAULT_MODEL = "deepseek/deepseek-v4-flash-0731:free";
const OPENAI_DEFAULT_MODEL = "gpt-5.6-luna";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export interface AiToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Wraps our plain {name, description, parameters} declarations into the Responses API's flat function-tool shape. */
export function toFunctionTool(decl: AiToolDeclaration): Tool {
  return {
    type: "function",
    name: decl.name,
    description: decl.description,
    parameters: decl.parameters,
    strict: false,
  };
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim() || isVertexConfigured());
}

/**
 * Minimal shape every provider client below satisfies — the only surface
 * our call sites use. Loosely typed (`create` returns `any`) since callers
 * need either `{ output_text }` (non-streaming) or an async-iterable event
 * stream (streaming), depending on whether they passed `stream: true` —
 * not something TS can discriminate through this shim automatically.
 */
export interface AiClient {
  responses: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(params: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<any>;
  };
}

function createOpenAiClient(): { ai: AiClient; model: string } {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OpenAI is not configured. Set OPENAI_API_KEY.");
  return {
    ai: new OpenAI({ apiKey }) as unknown as AiClient,
    model: process.env.OPENAI_MODEL?.trim() || OPENAI_DEFAULT_MODEL,
  };
}

function createOpenRouterClient(): { ai: AiClient; model: string } {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("OpenRouter is not configured. Set OPENROUTER_API_KEY.");
  return {
    ai: new OpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: { "HTTP-Referer": "https://apsurn.com", "X-Title": "apsurn" },
    }) as unknown as AiClient,
    model: process.env.OPENROUTER_MODEL?.trim() || OPENROUTER_DEFAULT_MODEL,
  };
}

/**
 * Resolves the currently-selected provider (openai | openrouter | vertex)
 * and returns a ready-to-use client plus the model name to pass alongside
 * it. Call once per request/turn — do not cache the result, since the
 * active provider can change at any time from the admin panel.
 *
 * No automatic fallback: if Vertex is selected but misconfigured, this
 * throws rather than silently routing to another provider — that silent
 * fallback was masking whether Vertex actually works, which defeats
 * debugging it. Re-add a fallback only once Vertex is confirmed reliable.
 */
export async function getAiClient(): Promise<{ ai: AiClient; model: string }> {
  const provider = await getActiveProvider();

  if (provider === "vertex") {
    const [geminiApiKey, serviceAccountJson] = await Promise.all([getGeminiApiKey(), getVertexServiceAccountJson()]);
    return { ai: createVertexAiClient(geminiApiKey, serviceAccountJson) as unknown as AiClient, model: getVertexModel() };
  }

  if (provider === "openai") return createOpenAiClient();
  return createOpenRouterClient();
}
