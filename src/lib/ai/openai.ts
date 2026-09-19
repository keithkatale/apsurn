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

/** First provider (other than Vertex) that actually has credentials configured, for fallback when Vertex fails. */
function fallbackAiClient(): { ai: AiClient; model: string } {
  if (process.env.OPENROUTER_API_KEY?.trim()) return createOpenRouterClient();
  if (process.env.OPENAI_API_KEY?.trim()) return createOpenAiClient();
  throw new Error("No AI provider is configured. Set OPENROUTER_API_KEY, OPENAI_API_KEY, or a working Vertex credential.");
}

/**
 * Resolves the currently-selected provider (openai | openrouter | vertex)
 * and returns a ready-to-use client plus the model name to pass alongside
 * it. Call once per request/turn — do not cache the result, since the
 * active provider can change at any time from the admin panel.
 *
 * Vertex is preferred by default (billing/credits live there), but it only
 * works in serverless production with a real service-account key — a local
 * `gcloud` ADC login never exists in a Vercel function. If Vertex fails to
 * initialize (missing/invalid credential), this falls back to whichever of
 * OpenRouter/OpenAI is actually configured instead of breaking every AI
 * call in the app.
 */
export async function getAiClient(): Promise<{ ai: AiClient; model: string }> {
  const provider = await getActiveProvider();

  if (provider === "vertex") {
    try {
      const [geminiApiKey, serviceAccountJson] = await Promise.all([getGeminiApiKey(), getVertexServiceAccountJson()]);
      return { ai: createVertexAiClient(geminiApiKey, serviceAccountJson) as unknown as AiClient, model: getVertexModel() };
    } catch (error) {
      console.error(
        "[ai] Vertex is the active provider but failed to initialize — falling back to another provider:",
        error instanceof Error ? error.message : error
      );
      return fallbackAiClient();
    }
  }

  if (provider === "openai") return createOpenAiClient();
  return createOpenRouterClient();
}
