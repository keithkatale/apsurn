/**
 * Shared JSON client for the open lead-source APIs.
 *
 * These endpoints are public and unauthenticated precisely because nobody
 * hammers them, so every call here is cached, capped and politely
 * rate-limited per host. Losing access to CMS or an ATS board would cost far
 * more than the handful of extra requests saved by skipping this.
 */

const USER_AGENT = "apsurn-lead-harvest/1.0 (+https://apsurn.com)";
const TIMEOUT_MS = 20_000;
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
export async function fetchJson<T = unknown>(url: string): Promise<T | null> {
  const cached = cache.get(url);
  if (cached && cached.expires > Date.now()) return cached.value as T;

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }

  await acquire(host);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const value = (await response.json()) as T;
    cache.set(url, { expires: Date.now() + CACHE_TTL_MS, value });
    return value;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    release(host);
  }
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
