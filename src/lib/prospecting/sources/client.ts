/**
 * Shared JSON client for the open lead-source APIs.
 *
 * These endpoints are public and unauthenticated precisely because nobody
 * hammers them, so every call here is cached, capped and politely
 * rate-limited per host. Losing access to CMS or an ATS board would cost far
 * more than the handful of extra requests saved by skipping this.
 */

const USER_AGENT = "apsurn-lead-harvest/1.0 (+https://apsurn.com)";
// The YC directory is ~2MB, and these endpoints time out intermittently under
// repeated use, so the window is generous and a failure is retried once.
const TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 1_200;
const CACHE_TTL_MS = 6 * 60 * 60_000;
const MAX_CONCURRENT_PER_HOST = 4;

interface CacheEntry {
  expires: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();
const inFlightPerHost = new Map<string, number>();
const waiters = new Map<string, Array<() => void>>();

async function acquire(host: string): Promise<void> {
  const current = inFlightPerHost.get(host) ?? 0;
  if (current < MAX_CONCURRENT_PER_HOST) {
    inFlightPerHost.set(host, current + 1);
    return;
  }
  await new Promise<void>((resolve) => {
    const queue = waiters.get(host) ?? [];
    queue.push(resolve);
    waiters.set(host, queue);
  });
  inFlightPerHost.set(host, (inFlightPerHost.get(host) ?? 0) + 1);
}

function release(host: string): void {
  inFlightPerHost.set(host, Math.max(0, (inFlightPerHost.get(host) ?? 1) - 1));
  const queue = waiters.get(host);
  const next = queue?.shift();
  if (next) next();
}

/**
 * Fetches JSON, returning null for any non-200 or unparseable response.
 *
 * Null is normal here, not exceptional: ATS token discovery works by probing
 * candidate URLs and reading the 404s, so a miss must be cheap and quiet.
 */
async function attempt<T>(url: string, host: string): Promise<{ ok: true; value: T } | { ok: false; reason: string }> {
  await acquire(host);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    return { ok: true, value: (await response.json()) as T };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.name : "request failed" };
  } finally {
    clearTimeout(timer);
    release(host);
  }
}

/**
 * Fetches JSON, returning null for any non-200 or unparseable response.
 *
 * Null is normal for probing — ATS token discovery works by reading 404s — so
 * a miss must be cheap and quiet. Callers that cannot tell a genuine "no
 * results" from a broken request should use fetchJsonOrThrow instead.
 */
export async function fetchJson<T = unknown>(url: string): Promise<T | null> {
  try {
    return await fetchJsonOrThrow<T>(url);
  } catch {
    return null;
  }
}

/** Thrown when a source could not be reached at all, as distinct from returning nothing. */
export class SourceUnavailableError extends Error {
  constructor(url: string, reason: string) {
    super(`Could not reach ${new URL(url).hostname} (${reason})`);
    this.name = "SourceUnavailableError";
  }
}

/**
 * Like fetchJson, but throws when the request fails.
 *
 * Collapsing an unreachable source into an empty result is what made a failed
 * lookup indistinguishable from "this filter matched nobody": the caller
 * reported zero companies and moved on to scraping, with nothing anywhere
 * saying the source had not answered.
 */
export async function fetchJsonOrThrow<T = unknown>(url: string): Promise<T> {
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return cached.value as T;

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new SourceUnavailableError(url, "invalid URL");
  }

  let last = "unknown error";
  for (let tries = 0; tries < 2; tries++) {
    if (tries > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    const result = await attempt<T>(url, host);
    if (result.ok) {
      cache.set(url, { expires: Date.now() + CACHE_TTL_MS, value: result.value });
      return result.value;
    }
    last = result.reason;
  }
  throw new SourceUnavailableError(url, last);
}

/** Registrable-ish host for a URL or bare domain: no scheme, no www, no path. */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(withScheme).hostname.replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/** Title-cases a SHOUTED registry name ("ACME DENTAL PLLC" → "Acme Dental PLLC"). */
export function tidyName(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value) return "";
  if (value !== value.toUpperCase()) return value;
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (/^(llc|pllc|pc|inc|pa|dds|dmd|md|ltd|llp)$/i.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return Math.floor((Date.now() - parsed) / 86_400_000);
}
