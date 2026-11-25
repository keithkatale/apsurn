import dns from "node:dns";
import net from "node:net";
import { GoogleGenAI } from "@google/genai";

dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

// Gemini adapter. It mirrors how the Elevate app runs in production:
//
//  1. A Google AI Studio API key is the preferred, production way in. It needs no IAM setup and works from any host
//     (Cloud Run included). Set GEMINI_API_KEY, or AI_API_KEY (Elevate's name) when AI_BASE_URL is empty or points at
//     generativelanguage.googleapis.com.
//  2. Vertex AI is the fallback when there is no key: GOOGLE_CLOUD_PROJECT plus either GOOGLE_SERVICE_ACCOUNT_JSON or
//     the machine's own identity (ADC). On Cloud Run that identity needs the "Vertex AI User" role on that project.
//  3. generateGeminiContent() wraps every call: a shared limiter, and when Gemini answers "busy" (429/5xx) it retries,
//     first on a fallback model (separate capacity pool), then with jittered back-off.

/** Gemini API key (AI Studio), or null when Vertex AI should be used instead. */
export function getGeminiApiKey(): string | null {
  const direct = process.env.GEMINI_API_KEY?.trim();
  if (direct) return direct;
  const elevateStyle = process.env.AI_API_KEY?.trim();
  const base = process.env.AI_BASE_URL?.trim() ?? "";
  if (elevateStyle && (!base || /generativelanguage\.googleapis\.com/.test(base))) return elevateStyle;
  return null;
}

export function isVertexConfigured(): boolean {
  return Boolean(getGeminiApiKey() || process.env.GOOGLE_CLOUD_PROJECT?.trim());
}

export function getVertexModel(): string {
  return (
    process.env.VERTEX_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    process.env.AI_MODEL?.trim() ||
    "gemini-3.1-flash-lite"
  );
}

/** Used when the main model is busy. A different model has its own capacity pool. */
export function getFallbackModel(): string {
  return process.env.AI_FALLBACK_MODEL?.trim() || "gemini-3.5-flash-lite";
}

export function getVertexLocation(): string {
  // Chat uses 'global' to reduce rate limiting (matches Apsurn)
  return process.env.GEMINI_LOCATION?.trim() || "global";
}

export function getVertexProjectLocation(): string {
  // Default region for other operations
  return process.env.GOOGLE_CLOUD_LOCATION?.trim() || "us-central1";
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
  if (
    obj.type !== "service_account" || 
    typeof obj.private_key !== "string" || 
    typeof obj.client_email !== "string"
  ) {
    throw new Error(
      'Not a service-account key — expected a JSON file with "type": "service_account".'
    );
  }
  return obj;
}

function createGenAI(
  geminiApiKey: string | null, 
  serviceAccountJson: string | null
): GoogleGenAI {
  const apiKey = geminiApiKey || getGeminiApiKey();
  if (apiKey) {
    return new GoogleGenAI({ apiKey });
  }

  const project = process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error(
      "Gemini is not configured. Set GEMINI_API_KEY (recommended), or GOOGLE_CLOUD_PROJECT for Vertex AI."
    );
  }
  
  // Use GEMINI_LOCATION (global) for chat, GOOGLE_CLOUD_LOCATION (us-central1) as default
  const location = getVertexLocation();

  const rawCredentials = 
    serviceAccountJson || 
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
    
  if (rawCredentials) {
    try {
      const credentials = parseServiceAccountJson(rawCredentials);
      return new GoogleGenAI({ 
        vertexai: true, 
        project, 
        location, 
        googleAuthOptions: { credentials } 
      });
    } catch (error) {
      console.error(
        "[ai/vertex] GOOGLE_SERVICE_ACCOUNT_JSON is set but unusable — trying Application Default Credentials instead:",
        error instanceof Error ? error.message : error
      );
    }
  }

  // Application Default Credentials fallback (primary method for Apsurn)
  console.log(`[ai/vertex] Using ADC for project ${project} in location ${location}`);
  return new GoogleGenAI({ vertexai: true, project, location });
}

/**
 * Create a Vertex AI client for use with the Vercel AI SDK.
 * This uses the Google GenAI SDK which works with both Gemini API and Vertex AI.
 * 
 * Configuration matches Apsurn:
 * - Project: project-b102c767-2daf-40a0-a65
 * - Location: global (for chat)
 * - Auth: ADC (gcloud auth application-default login)
 */
export function createVertexClient(
  geminiApiKey: string | null = null,
  serviceAccountJson: string | null = null
): GoogleGenAI {
  return createGenAI(geminiApiKey, serviceAccountJson);
}

// ---------------------------------------------------------------------------
// Resilient generation: shared limiter + busy retry on a fallback model.
// ---------------------------------------------------------------------------

type GenerateParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];

const MAX_INFLIGHT = Number(process.env.AI_MAX_INFLIGHT) || 24;
let limit = Math.min(12, MAX_INFLIGHT);
let inflight = 0;
let goodStreak = 0;
const waiters: Array<() => void> = [];

async function acquire() {
  while (inflight >= limit) await new Promise<void>((resolve) => waiters.push(resolve));
  inflight += 1;
}

function release() {
  inflight -= 1;
  waiters.shift()?.();
}

function gateOk() {
  goodStreak += 1;
  if (goodStreak >= 8 && limit < MAX_INFLIGHT) {
    limit += 1;
    goodStreak = 0;
    waiters.shift()?.();
  }
}

function gateBusy() {
  limit = Math.max(2, Math.floor(limit * 0.7));
  goodStreak = 0;
}

function errorStatus(error: unknown): number | null {
  const e = error as { status?: unknown; code?: unknown; message?: string };
  const direct = Number(e?.status ?? e?.code);
  if (Number.isFinite(direct) && direct >= 100) return direct;
  const match = /"code"\s*:\s*(\d{3})|\b(429|500|502|503|504)\b/.exec(e?.message ?? "");
  return match ? Number(match[1] ?? match[2]) : null;
}

function isBusy(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === 429 || (status !== null && status >= 500)) return true;
  return /RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded|try again/i.test((error as Error)?.message ?? "");
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * generateContent with the app-wide limiter. A busy answer (429/5xx) is retried: immediately on the fallback model
 * first, then with growing, jittered waits. Any other error (bad key, permission, bad request) is thrown straight away.
 */
export async function generateGeminiContent(client: GoogleGenAI, params: GenerateParams) {
  const TRIES = 5;
  const fallback = getFallbackModel();
  let lastError: unknown;
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    const useFallback = attempt > 0 && fallback && fallback !== params.model;
    await acquire();
    try {
      const response = await client.models.generateContent(useFallback ? { ...params, model: fallback } : params);
      gateOk();
      return response;
    } catch (error) {
      lastError = error;
      if (!isBusy(error)) throw error;
      if (errorStatus(error) === 429) gateBusy();
    } finally {
      release();
    }
    if (attempt < TRIES - 1) {
      const wait = attempt === 0 && fallback ? 300 : Math.min(12_000, 1_200 * 2 ** attempt) * (0.5 + Math.random());
      console.warn(`[ai] Gemini busy, retrying (${attempt + 1}/${TRIES - 1}) in ${Math.round(wait)}ms`);
      await sleep(wait);
    }
  }
  throw lastError;
}
