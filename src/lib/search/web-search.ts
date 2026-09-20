/**
 * Real web search returning real URLs.
 *
 * Why this exists: both the prospecting agent and market-insights listening
 * used to "search" by asking the LLM to emit a JSON array of result URLs with
 * a provider web-search tool enabled. That silently does not work on Gemini/
 * Vertex, which is the app's default provider:
 *
 *   - Google Search grounding drops `site:` operators, so platform-scoped
 *     searches (site:reddit.com …) came back with zero grounding chunks and
 *     the model answered `[]`.
 *   - With no grounding chunks the model still answers — from memory — so the
 *     agent received confidently-formatted URLs that simply do not exist
 *     (verified: entire result sets returning 404/410/DNS failure).
 *   - Grounded answers cite `vertexaisearch.cloud.google.com/grounding-api-
 *     redirect/…` URLs rather than the underlying page, so even a successful
 *     grounded search cannot supply a source URL worth storing or scraping.
 *   - Grounding cannot be combined with JSON response formatting at all
 *     (Vertex rejects it: "controlled generation is not supported with Search
 *     tool"), which is what the JSON-shaped search prompts were asking for.
 *
 * An LLM is the wrong tool for "which URLs exist". This module centralises the
 * search step so the rest of the app only ever receives URLs that a real
 * search engine returned, and leaves the LLM to do what it is good at: reading
 * and structuring pages we hand it.
 *
 * Backends, in order:
 *   1. OpenAI's hosted `web_search` tool. Verified to return real, live,
 *      recent URLs that honour `site:`-style scoping (spot-checked: every
 *      returned thread resolved 200, against 0/4 for the Vertex path). This
 *      is used for search ONLY — it is deliberately independent of the
 *      app's configured reasoning provider, so keeping Vertex selected in
 *      /admin (where the credits are) does not reintroduce fabricated URLs.
 *   2. DuckDuckGo's keyless HTML endpoint, as a no-cost fallback. It works
 *      from residential IPs but answers HTTP 202 with an empty SERP once it
 *      decides it is being automated, which it does quickly from datacenter
 *      ranges like Cloud Run's — so it cannot be the primary.
 *
 * Set SEARCH_BACKEND_URL to prepend a different HTML-shaped engine.
 */

const ENDPOINTS = ["https://html.duckduckgo.com/html/", "https://lite.duckduckgo.com/lite/"];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const TIMEOUT_MS = 12_000;

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
}

/** Thrown when the search backend itself fails, so callers can surface it instead of reporting "no results". */
export class WebSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebSearchError";
  }
}

function decodeEntities(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** DuckDuckGo wraps every result href as /l/?uddg=<percent-encoded target>. */
function unwrapRedirect(href: string): string | null {
  const match = href.match(/[?&]uddg=([^&"']+)/);
  const candidate = match ? safeDecode(match[1]) : href;
  if (!/^https?:\/\//i.test(candidate)) return null;
  return candidate;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Parses result blocks out of the HTML SERP. Titles and snippets are
 * best-effort: a missing snippet is not a reason to drop an otherwise valid
 * result, since the URL is the part callers actually depend on.
 */
function parseResults(html: string): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const seen = new Set<string>();

  const linkPattern = /<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(linkPattern)) {
    const url = unwrapRedirect(match[1]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    results.push({ url, title: decodeEntities(match[2]).slice(0, 300), snippet: "" });
  }

  // The lite endpoint has no result__a class; fall back to any redirect link.
  if (results.length === 0) {
    for (const match of html.matchAll(/href="(\/l\/\?[^"]*uddg=[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const url = unwrapRedirect(match[1]);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      results.push({ url, title: decodeEntities(match[2]).slice(0, 300), snippet: "" });
    }
  }

  const snippets = [...html.matchAll(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) =>
    decodeEntities(m[1]).slice(0, 600)
  );
  for (let i = 0; i < results.length; i++) {
    if (snippets[i]) results[i].snippet = snippets[i];
  }

  return results;
}

async function fetchSerp(endpoint: string, query: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: new URLSearchParams({ q: query }).toString(),
      signal: controller.signal,
    });
    if (!response.ok) throw new WebSearchError(`search backend returned HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractJsonArray(text: string): unknown[] {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const attempt = (value: string): unknown[] => {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  };
  try {
    return attempt(cleaned);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try {
        return attempt(cleaned.slice(start, end + 1));
      } catch {
        return [];
      }
    }
    return [];
  }
}

/** OpenAI's hosted web_search tool. Returns real URLs; used for search regardless of the configured reasoning provider. */
async function searchViaOpenAi(query: string, limit: number): Promise<WebSearchResult[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new WebSearchError("OPENAI_API_KEY is not set (required for web search)");

  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const response = await client.responses.create({
    model: process.env.OPENAI_SEARCH_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-5.6-luna",
    input: `Using web search, find up to ${limit} results for this query: ${query}

Return ONLY a JSON array (no markdown fences, no commentary):
[{"url": string, "title": string, "snippet": string}]

Every URL must be one you actually found via web search — never construct, guess, or recall a URL from memory. If the query uses a site: restriction, only return URLs on that site. If you find nothing, return [].`,
    tools: [{ type: "web_search" }],
  });

  const out: WebSearchResult[] = [];
  const seen = new Set<string>();
  for (const raw of extractJsonArray(response.output_text ?? "[]")) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url: url.slice(0, 1000),
      title: typeof o.title === "string" ? o.title.slice(0, 300) : "",
      snippet: typeof o.snippet === "string" ? o.snippet.slice(0, 600) : "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function searchViaHtmlEndpoints(query: string, limit: number, failures: string[]): Promise<WebSearchResult[]> {
  const endpoints = process.env.SEARCH_BACKEND_URL?.trim()
    ? [process.env.SEARCH_BACKEND_URL.trim(), ...ENDPOINTS]
    : ENDPOINTS;

  for (const endpoint of endpoints) {
    try {
      const results = parseResults(await fetchSerp(endpoint, query));
      if (results.length > 0) return results.slice(0, limit);
      failures.push(`${endpoint}: no parsable results (likely rate-limited)`);
    } catch (error) {
      failures.push(`${endpoint}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }
  return [];
}

/**
 * Runs `query` and returns up to `limit` real results.
 *
 * Throws WebSearchError when every backend fails — an empty array from this
 * function means "the engines genuinely found nothing", never "the search
 * broke". Callers rely on that distinction to report failures honestly
 * instead of silently reporting zero leads/mentions.
 */
export async function webSearchResults(query: string, limit = 10): Promise<WebSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const failures: string[] = [];

  try {
    const results = await searchViaOpenAi(trimmed, limit);
    if (results.length > 0) return results;
    failures.push("openai web_search: no results");
  } catch (error) {
    failures.push(`openai web_search: ${error instanceof Error ? error.message : "request failed"}`);
  }

  const fallback = await searchViaHtmlEndpoints(trimmed, limit, failures);
  if (fallback.length > 0) return fallback;

  throw new WebSearchError(`Web search failed for "${trimmed.slice(0, 80)}" — ${failures.join("; ")}`);
}

/** Runs several queries concurrently and merges them, de-duplicated, preserving per-query order. */
export async function webSearchMany(queries: string[], limitPerQuery = 10): Promise<WebSearchResult[]> {
  const settled = await Promise.allSettled(queries.map((query) => webSearchResults(query, limitPerQuery)));

  const merged: WebSearchResult[] = [];
  const seen = new Set<string>();
  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") continue;
    for (const result of outcome.value) {
      if (seen.has(result.url)) continue;
      seen.add(result.url);
      merged.push(result);
    }
  }

  if (merged.length === 0) {
    const firstError = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
    if (firstError) {
      throw new WebSearchError(
        firstError.reason instanceof Error ? firstError.reason.message : "Web search failed for every query"
      );
    }
  }
  return merged;
}
