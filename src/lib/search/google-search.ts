/**
 * Resilient, keyless web search. Defaults to DuckDuckGo (zero keys/tokens required).
 * If APIFY_TOKEN is present it attempts Google, but seamlessly falls back so search never fails.
 */
import { duckDuckGoSearch, type SearchResult } from "./duckduckgo";

export type GoogleResult = SearchResult;

const ACTOR = "apify~google-search-scraper";

export class GoogleSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleSearchError";
  }
}

async function googleSearchOnce(
  query: string,
  opts: { limit?: number; pastDays?: number; domains?: string[]; timeoutSeconds?: number } = {},
): Promise<GoogleResult[]> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    // 100% keyless fallback (no Apify, no keys)
    return duckDuckGoSearch(query, opts);
  }
  const limit = Math.min(20, Math.max(1, opts.limit ?? 8));
  const scope = (opts.domains ?? []).map((domain) => `site:${domain}`).join(" OR ");
  const q = scope ? `${query} (${scope})` : query;
  const range = opts.pastDays ? (opts.pastDays <= 1 ? "d1" : opts.pastDays <= 7 ? "w1" : opts.pastDays <= 31 ? "m1" : "y1") : undefined;

  try {
    const response = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=${opts.timeoutSeconds ?? 20}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queries: q, maxPagesPerQuery: 1, resultsPerPage: limit, languageCode: "en", countryCode: "us", ...(range ? { quickDateRange: range } : {}) }),
      signal: AbortSignal.timeout((opts.timeoutSeconds ?? 20) * 1000 + 3000),
    });
    if (!response.ok) {
      return duckDuckGoSearch(query, opts);
    }
    const data = (await response.json().catch(() => null)) as Array<{ organicResults?: Array<{ title?: string; url?: string; description?: string; date?: string }> }> | null;
    const organic = (Array.isArray(data) ? data : []).flatMap((page) => page.organicResults ?? []);
    const seen = new Set<string>();
    const results: GoogleResult[] = [];
    for (const row of organic) {
      if (!row.url || seen.has(row.url)) continue;
      seen.add(row.url);
      results.push({ title: (row.title ?? row.url).slice(0, 200), url: row.url, snippet: (row.description ?? "").slice(0, 400), date: row.date ?? null });
      if (results.length >= limit) break;
    }
    return results.length > 0 ? results : duckDuckGoSearch(query, opts);
  } catch {
    return duckDuckGoSearch(query, opts);
  }
}

export async function googleSearch(query: string, opts: Parameters<typeof googleSearchOnce>[1] = {}): Promise<GoogleResult[]> {
  try {
    return await googleSearchOnce(query, opts);
  } catch {
    return duckDuckGoSearch(query, opts);
  }
}
