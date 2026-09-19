import { createAdminClient } from "@/lib/supabase/admin";

export const AI_PROVIDERS = ["openai", "openrouter", "vertex"] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

const SETTINGS_KEY = "ai_provider";
const VERTEX_CREDENTIALS_KEY = "vertex_service_account_json";
const GEMINI_API_KEY_KEY = "gemini_api_key";
const CACHE_MS = 15_000;

let cached: { provider: AiProviderId; expiresAt: number } | null = null;
let cachedVertexCredentials: { json: string | null; expiresAt: number } | null = null;
let cachedGeminiApiKey: { key: string | null; expiresAt: number } | null = null;

function defaultProvider(): AiProviderId {
  const envValue = process.env.AI_PROVIDER?.trim();
  // Vertex is the preferred default (billing/credits live there) — but it
  // only actually works in serverless production with a real service-account
  // key. ADC (a local `gcloud` login) never exists in a Vercel function, so
  // if Vertex isn't properly configured yet, getAiClient() falls back to a
  // working provider automatically rather than breaking every AI call — see
  // its try/catch below.
  return (AI_PROVIDERS as readonly string[]).includes(envValue ?? "") ? (envValue as AiProviderId) : "vertex";
}

/** The AI provider currently selected in the admin panel, cached briefly to avoid a DB round-trip on every AI call. */
export async function getActiveProvider(): Promise<AiProviderId> {
  if (cached && cached.expiresAt > Date.now()) return cached.provider;

  const db = createAdminClient();
  const { data, error } = await db.from("app_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  if (error) console.error("[ai/settings] failed to read active provider, falling back to default:", error.message);
  const stored = (data?.value as { provider?: string } | null)?.provider;
  const provider = (AI_PROVIDERS as readonly string[]).includes(stored ?? "") ? (stored as AiProviderId) : defaultProvider();

  cached = { provider, expiresAt: Date.now() + CACHE_MS };
  return provider;
}

export async function setActiveProvider(provider: AiProviderId): Promise<void> {
  const db = createAdminClient();
  const { error } = await db
    .from("app_settings")
    .upsert({ key: SETTINGS_KEY, value: { provider }, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  cached = { provider, expiresAt: Date.now() + CACHE_MS };
}

/**
 * The Vertex service-account key, stored in the app's own database rather
 * than on any developer's machine — pasted once via the admin panel. Never
 * logged; only ever passed straight into the Vertex client (see vertex.ts).
 */
export async function getVertexServiceAccountJson(): Promise<string | null> {
  if (cachedVertexCredentials && cachedVertexCredentials.expiresAt > Date.now()) return cachedVertexCredentials.json;

  const db = createAdminClient();
  const { data, error } = await db.from("app_settings").select("value").eq("key", VERTEX_CREDENTIALS_KEY).maybeSingle();
  if (error) console.error("[ai/settings] failed to read Vertex credentials:", error.message);
  const json = (data?.value as { json?: string } | null)?.json ?? null;

  cachedVertexCredentials = { json, expiresAt: Date.now() + CACHE_MS };
  return json;
}

export async function setVertexServiceAccountJson(json: string | null): Promise<void> {
  const db = createAdminClient();
  const { error } = await db
    .from("app_settings")
    .upsert({ key: VERTEX_CREDENTIALS_KEY, value: { json }, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  cachedVertexCredentials = { json, expiresAt: Date.now() + CACHE_MS };
}

/** A plain Gemini Developer API key (from https://aistudio.google.com/apikey) — no GCP project or IAM involved. */
export async function getGeminiApiKey(): Promise<string | null> {
  if (cachedGeminiApiKey && cachedGeminiApiKey.expiresAt > Date.now()) return cachedGeminiApiKey.key;

  const db = createAdminClient();
  const { data, error } = await db.from("app_settings").select("value").eq("key", GEMINI_API_KEY_KEY).maybeSingle();
  if (error) console.error("[ai/settings] failed to read Gemini API key:", error.message);
  const key = (data?.value as { key?: string } | null)?.key ?? null;

  cachedGeminiApiKey = { key, expiresAt: Date.now() + CACHE_MS };
  return key;
}

export async function setGeminiApiKey(key: string | null): Promise<void> {
  const db = createAdminClient();
  const { error } = await db
    .from("app_settings")
    .upsert({ key: GEMINI_API_KEY_KEY, value: { key }, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  cachedGeminiApiKey = { key, expiresAt: Date.now() + CACHE_MS };
}
