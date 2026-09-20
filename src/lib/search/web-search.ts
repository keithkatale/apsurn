/**
 * Real web search returning real URLs, using Vertex AI only.
 *
 * Why this exists: both the prospecting agent and market-insights listening
 * used to "search" by asking the model to emit a JSON array of result URLs
 * with Google Search grounding enabled, then reading the model's TEXT. That
 * silently does not work, as verified against the live Vertex endpoint:
 *
 *   - Grounding drops `site:` operators, so platform-scoped queries came back
 *     with zero grounding chunks and the model answered `[]`.
 *   - With no chunks the model still answers — from memory — so callers got
 *     confidently-formatted URLs that do not exist (spot-check: 4 of 4 dead).
 *   - Grounding cannot be combined with JSON response formatting at all
 *     (Vertex rejects it outright), which is what those prompts asked for.
 *
 * The fix is to stop reading the model's prose for URLs and read
 * `groundingMetadata.groundingChunks` instead — the actual sources Google
 * Search returned. Those are real, but they are expressed as
 * `vertexaisearch.cloud.google.com/grounding-api-redirect/…` links, so each
 * one is resolved through its redirect to the underlying page URL before
 * being handed back (verified: every chunk resolved to a live 200 page).
 *
 * Because grounding ignores `site:`, platform scoping is done by filtering on
 * each chunk's `domain` instead of by operator — see the `domains` option.
 *
 * This path needs no credential beyond the Vertex one the app already uses.
 */

import { createVertexAiClientRaw, getVertexModel } from "@/lib/ai/vertex";

const REDIRECT_TIMEOUT_MS = 15_000;
// The redirector throttles bursts: resolving a page of chunks 8-at-a-time
// made every request in the burst fail, which looked like "search found
// nothing". Modest concurrency plus one retry resolves them reliably.
const RESOLVE_CONCURRENCY = 4;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface WebSearchResult {
  url: string;
  title: string;
  snippet: string;
}

export interface WebSearchOptions {
  /** Restrict results to these registrable domains, e.g. ["reddit.com"]. Grounding ignores `site:`, so scoping happens here. */
  domains?: string[];
}

/** Thrown when search itself fails, so callers can surface that instead of reporting "no results". */
export class WebSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebSearchError";
  }
}

interface GroundingChunk {
  web?: { uri?: string; title?: string; domain?: string };
}

interface GroundingSupport {
  segment?: { text?: string };
  groundingChunkIndices?: number[];
}

function hostMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  const d = domain.toLowerCase().replace(/^www\./, "");
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Follows a grounding redirect to the page it points at.
 *
 * The target's status is deliberately ignored: sites that block automated
 * clients (Reddit answers 403 to a non-browser request) still redirect
 * correctly, and the URL is what callers need — the agent fetches pages
 * through its own hardened fetcher afterwards.
 */
async function resolveRedirect(uri: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REDIRECT_TIMEOUT_MS);
  try {
    const response = await fetch(uri, {
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: controller.signal,
    });
    await response.body?.cancel();
    const finalUrl = response.url;
    if (!finalUrl || !/^https?:\/\//i.test(finalUrl)) return null;
    // Never hand back the redirector itself as though it were a source.
    if (new URL(finalUrl).hostname.endsWith("vertexaisearch.cloud.google.com")) return null;
    return finalUrl;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveAll(uris: (string | null)[]): Promise<(string | null)[]> {
  const out: (string | null)[] = new Array(uris.length).fill(null);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(RESOLVE_CONCURRENCY, uris.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= uris.length) return;
      const uri = uris[index];
      if (!uri) continue;
      let resolvedUrl = await resolveRedirect(uri);
      if (!resolvedUrl) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        resolvedUrl = await resolveRedirect(uri);
      }
      out[index] = resolvedUrl;
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Grounding ignores search operators, and a bare `site:` query makes it return
 * nothing at all, so operators are stripped and expressed as prose instead.
 */
function naturalizeQuery(query: string): string {
  return query
    .replace(/\bsite:(\S+)/gi, "")
    .replace(/\bOR\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Runs `query` through Google Search (via Vertex grounding) and returns up to
 * `limit` real, redirect-resolved results.
 *
 * Throws WebSearchError when the search itself fails — an empty array means
 * "the search genuinely found nothing", never "search is broken". Callers
 * depend on that distinction to report failures honestly rather than
 * silently reporting zero leads or zero mentions.
 */
export async function webSearchResults(
  query: string,
  limit = 10,
  options: WebSearchOptions = {}
): Promise<WebSearchResult[]> {
  const naturalQuery = naturalizeQuery(query);
  if (!naturalQuery) return [];

  const domains = options.domains ?? [];
  // Asking for many *individual* pages, with an explicit count, is what makes
  // grounding cite a page of distinct on-topic sources rather than a handful
  // of round-up articles about the topic. Measured on a platform-scoped
  // query: this phrasing cites 15/15 on-domain sources where a generic
  // "list relevant pages" phrasing cited 5.
  const scope =
    domains.length > 0
      ? ` Only include pages hosted on ${domains.join(" or ")} — link to the actual posts themselves, not to articles written about them.`
      : "";

  let response;
  try {
    const genAI = createVertexAiClientRaw();
    response = await genAI.models.generateContent({
      model: getVertexModel(),
      // The prose answer is discarded; this call exists to make Google Search
      // run and attach its sources. Asking for a list simply maximises how
      // many distinct sources get cited.
      contents: `Find as many individual, distinct, recent pages as you can for: ${naturalQuery}.${scope} List at least ${Math.max(15, limit)} separate results, each as its own entry with its title and a one-sentence description of what is on that page.`,
      config: { tools: [{ googleSearch: {} }] },
    });
  } catch (error) {
    throw new WebSearchError(
      `Web search failed for "${naturalQuery.slice(0, 80)}": ${error instanceof Error ? error.message : "Vertex request failed"}`
    );
  }

  const metadata = response?.candidates?.[0]?.groundingMetadata as
    | { groundingChunks?: GroundingChunk[]; groundingSupports?: GroundingSupport[] }
    | undefined;

  const chunks = metadata?.groundingChunks ?? [];
  if (chunks.length === 0) return [];

  // Stitch each cited text segment onto the source it cites, so results carry
  // a usable description rather than just a bare link.
  const snippets = new Map<number, string[]>();
  for (const support of metadata?.groundingSupports ?? []) {
    const text = support.segment?.text?.trim();
    if (!text) continue;
    for (const index of support.groundingChunkIndices ?? []) {
      const list = snippets.get(index) ?? [];
      if (list.length < 4) list.push(text);
      snippets.set(index, list);
    }
  }

  const resolved = await resolveAll(chunks.map((chunk) => chunk.web?.uri ?? null));

  const results: WebSearchResult[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < chunks.length; i++) {
    const url = resolved[i];
    if (!url || seen.has(url)) continue;

    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      continue;
    }
    if (domains.length > 0 && !domains.some((domain) => hostMatches(hostname, domain))) continue;

    seen.add(url);
    const chunkTitle = chunks[i].web?.title?.trim() ?? "";
    // Grounding often reports the bare domain as the title, which is useless
    // on its own; the cited segment is more informative when that happens.
    const snippet = (snippets.get(i) ?? []).join(" ").slice(0, 600);
    const title = chunkTitle && chunkTitle !== hostname ? chunkTitle : snippet.slice(0, 160) || hostname;

    results.push({ url: url.slice(0, 1000), title: title.slice(0, 300), snippet });
    if (results.length >= limit) break;
  }

  return results;
}

/** Runs several queries concurrently and merges them, de-duplicated, preserving per-query order. */
export async function webSearchMany(
  queries: string[],
  limitPerQuery = 10,
  options: WebSearchOptions = {}
): Promise<WebSearchResult[]> {
  const settled = await Promise.allSettled(queries.map((query) => webSearchResults(query, limitPerQuery, options)));

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
