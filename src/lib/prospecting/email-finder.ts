/**
 * Paid email discovery, tried before falling back to pattern guessing.
 *
 * Guessing an address from a name and a domain gets a usable answer perhaps a
 * third of the time, and every miss costs a verifier round trip. A discovery
 * provider has already crawled and cross-referenced the sources we cannot
 * reach, so it answers in one call and its answer is a found address rather
 * than a hypothesis.
 *
 * Icypeas is the configured provider: cheapest real entry point ($19/month
 * for 1,000 credits), credits are only consumed on a successful find so
 * misses are free, and unused credits roll over without expiry — which suits
 * unpredictable volume. It reports the lowest false-positive rate of the
 * single-source tools, which is what protects an unwarmed sending domain.
 *
 * Entirely optional: with no API key configured every function here returns
 * null and callers fall through to the existing pattern logic, so the app
 * works exactly as before until a key is set.
 */

import type { ContactStatus } from "./types";

const BASE_URL = "https://app.icypeas.com/api";
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Discovery is asynchronous: the search is queued, then polled.
 *
 * The two outcomes have very different shapes. A hit usually lands in the
 * first few seconds (measured: 3.8s and 8.3s against live lookups), so early
 * polls are frequent and then back off. A miss only reveals itself by never
 * completing, so it is bounded by wall clock rather than by an attempt count
 * — counting attempts ignored the round-trip time and let a miss run to 18s
 * of a four-minute budget.
 */
const POLL_BACKOFF_MS = [600, 700, 900, 1_100, 1_300, 1_500, 1_800, 2_000];
const MAX_POLL_WALLCLOCK_MS = 12_000;

export interface FoundEmail {
  email: string;
  /** Mapped from the provider's own confidence wording. */
  status: ContactStatus;
  provider: string;
  certainty: string | null;
}

export function isEmailFinderConfigured(): boolean {
  return Boolean(process.env.ICYPEAS_API_KEY?.trim());
}

/**
 * Icypeas grades each address it returns. Only the confident grades are
 * treated as send-ready; anything weaker is handed back as `risky` so the
 * existing verifier decides, rather than being trusted on the provider's word.
 */
function mapCertainty(certainty: string | null): ContactStatus {
  switch ((certainty ?? "").toLowerCase()) {
    case "ultra_sure":
    case "sure":
      return "verified";
    case "very_probable":
    case "probable":
      return "accept_all";
    default:
      return "risky";
  }
}

interface SearchResponse {
  success?: boolean;
  item?: { _id?: string; status?: string };
}

interface PollResponse {
  items?: Array<{
    status?: string;
    results?: { emails?: Array<{ email?: string; certainty?: string }> };
  }>;
}

async function post<T>(path: string, body: unknown, apiKey: string): Promise<T | null> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function splitName(fullName: string): { firstname: string; lastname: string } | null {
  const parts = fullName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  return { firstname: parts[0], lastname: parts[parts.length - 1] };
}

const TERMINAL_STATUSES = new Set(["DEBITED", "FREE", "NONE_FOUND", "FAILED", "ABORTED"]);

/**
 * Finds a work email for a person at a domain.
 *
 * Returns null for every failure mode — unconfigured, rate-limited, timed
 * out, or genuinely not found — because the caller's job is to fall back to
 * pattern guessing, not to distinguish between those. Failures are logged,
 * never thrown: one provider hiccup must not abort a prospecting run.
 */
export async function findEmail(fullName: string, domain: string): Promise<FoundEmail | null> {
  const apiKey = process.env.ICYPEAS_API_KEY?.trim();
  if (!apiKey) return null;

  const name = splitName(fullName);
  if (!name || !domain) return null;

  const started = await post<SearchResponse>(
    "/email-search",
    { firstname: name.firstname, lastname: name.lastname, domainOrCompany: domain },
    apiKey
  );
  const searchId = started?.item?._id;
  if (!searchId) {
    console.warn(`[email-finder] search could not be queued for ${name.lastname} @ ${domain}`);
    return null;
  }

  const pollingDeadline = Date.now() + MAX_POLL_WALLCLOCK_MS;
  for (let attempt = 0; Date.now() < pollingDeadline; attempt++) {
    const delay = POLL_BACKOFF_MS[Math.min(attempt, POLL_BACKOFF_MS.length - 1)];
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, pollingDeadline - Date.now())));
    if (Date.now() >= pollingDeadline) break;

    const polled = await post<PollResponse>("/bulk-single-searchs/read", { id: searchId }, apiKey);
    const item = polled?.items?.[0];
    if (!item) continue;

    const status = (item.status ?? "").toUpperCase();
    if (!TERMINAL_STATUSES.has(status)) continue;

    const best = item.results?.emails?.find((entry) => entry.email);
    if (!best?.email) return null; // Finished, found nothing — no credit spent.

    return {
      email: best.email.toLowerCase(),
      status: mapCertainty(best.certainty ?? null),
      provider: "icypeas",
      certainty: best.certainty ?? null,
    };
  }

  // Still running past the poll budget. The credit is only spent on a find, so
  // abandoning here costs nothing; the caller falls back to pattern guessing.
  return null;
}
