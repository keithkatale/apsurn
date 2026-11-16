/**
 * Keyless, zero-token web search powered by DuckDuckGo HTML endpoint.
 * Adapted from OpenClaw's resilient ddg-client architecture.
 * Requires no API keys, no tokens, and no Apify actors.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date: string | null;
}

const DDG_HTML_ENDPOINT = "https://html.duckduckgo.com/html";
const DDG_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&#x27;": "'",
  "&#x2F;": "/",
  "&nbsp;": " ",
  "&ndash;": "-",
  "&mdash;": "--",
  "&hellip;": "...",
};

function decodeHtml(raw: string): string {
  return raw.replace(/&(?:amp|lt|gt|quot|apos|#39|#x27|#x2F|nbsp|ndash|mdash|hellip);/gi, (match) => ENTITY_MAP[match.toLowerCase()] ?? match);
}

function stripTags(html: string): string {
  return html
    .replace(/<\/?b\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTargetUrl(rawHref: string): string {
  try {
    const cleanHref = rawHref.startsWith("//") ? `https:${rawHref}` : rawHref;
    const parsed = new URL(cleanHref);
    const uddg = parsed.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
    return cleanHref;
  } catch {
    return rawHref;
  }
}

/** Simple 10-minute cache to respect rate limits and keep response times fast. */
const cache = new Map<string, { results: SearchResult[]; expiresAt: number }>();

export async function duckDuckGoSearch(
  query: string,
  opts: { limit?: number; pastDays?: number; domains?: string[]; timeoutSeconds?: number } = {},
): Promise<SearchResult[]> {
  const limit = Math.min(20, Math.max(1, opts.limit ?? 8));
  const domainScope = (opts.domains ?? []).map((d) => `site:${d}`).join(" OR ");
  const fullQuery = domainScope ? `${query} (${domainScope})` : query;

  const cacheKey = `${fullQuery}:${limit}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.results;
  }

  const url = new URL(DDG_HTML_ENDPOINT);
  url.searchParams.set("q", fullQuery);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), (opts.timeoutSeconds ?? 15) * 1000);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": DDG_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const results: SearchResult[] = [];
    const seenUrls = new Set<string>();

    const resultRegex = /<a\b(?=[^>]*\bclass="[^"]*\bresult__a\b[^"]*")([^>]*)>([\s\S]*?)<\/a>/gi;
    const nextResultRegex = /<a\b(?=[^>]*\bclass="[^"]*\bresult__a\b[^"]*")[^>]*>/i;
    const snippetRegex = /<a\b(?=[^>]*\bclass="[^"]*\bresult__snippet\b[^"]*")[^>]*>([\s\S]*?)<\/a>/i;

    for (const match of html.matchAll(resultRegex)) {
      const rawAttrs = match[1] ?? "";
      const rawTitle = match[2] ?? "";
      const hrefMatch = /\bhref="([^"]*)"/i.exec(rawAttrs);
      if (!hrefMatch) continue;

      const rawUrl = hrefMatch[1];
      const targetUrl = extractTargetUrl(rawUrl);

      if (!targetUrl.startsWith("http") || seenUrls.has(targetUrl)) continue;
      seenUrls.add(targetUrl);

      const matchEnd = (match.index ?? 0) + match[0].length;
      const trailingHtml = html.slice(matchEnd);
      const nextIndex = trailingHtml.search(nextResultRegex);
      const scopedSnippetHtml = nextIndex >= 0 ? trailingHtml.slice(0, nextIndex) : trailingHtml;

      const snippetMatch = snippetRegex.exec(scopedSnippetHtml);
      const rawSnippet = snippetMatch ? snippetMatch[1] : "";

      const title = decodeHtml(stripTags(rawTitle));
      const snippet = decodeHtml(stripTags(rawSnippet));

      if (title && targetUrl) {
        results.push({
          title,
          url: targetUrl,
          snippet,
          date: null,
        });
      }

      if (results.length >= limit) break;
    }

    cache.set(cacheKey, { results, expiresAt: now + 10 * 60 * 1000 });
    return results;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return [];
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}
