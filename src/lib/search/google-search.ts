/**
 * Real Google results through Apify's Google Search Scraper (real URLs, snippets and dates; `site:` and date
 * operators work, unlike model-grounded search). Needs APIFY_TOKEN. A search takes 15-30s because the actor starts
 * a browser, so callers should make few, well-formed queries.
 */
export interface GoogleResult {
  title: string;
  url: string;
  snippet: string;
  date: string | null;
}

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
  if (!token) throw new GoogleSearchError("Web search is not configured (APIFY_TOKEN is missing).");
  const limit = Math.min(20, Math.max(1, opts.limit ?? 8));
  const scope = (opts.domains ?? []).map((domain) => `site:${domain}`).join(" OR ");
  const q = scope ? `${query} (${scope})` : query;
  // Google's quick date ranges: past day, week, month, year.
  const range = opts.pastDays ? (opts.pastDays <= 1 ? "d1" : opts.pastDays <= 7 ? "w1" : opts.pastDays <= 31 ? "m1" : "y1") : undefined;

  let response: Response;
  try {
    response = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${token}&timeout=${opts.timeoutSeconds ?? 45}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ queries: q, maxPagesPerQuery: 1, resultsPerPage: limit, languageCode: "en", countryCode: "us", ...(range ? { quickDateRange: range } : {}) }),
      signal: AbortSignal.timeout((opts.timeoutSeconds ?? 45) * 1000 + 5000),
    });
  } catch (error) {
    throw new GoogleSearchError(`Web search could not be reached: ${error instanceof Error ? error.message : "network error"}`);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new GoogleSearchError(`Web search failed (HTTP ${response.status}): ${text.slice(0, 160)}`);
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
  return results;
}

/** Google occasionally stalls a run; one quick retry is far cheaper than failing the whole step. */
export async function googleSearch(query: string, opts: Parameters<typeof googleSearchOnce>[1] = {}): Promise<GoogleResult[]> {
  try {
    return await googleSearchOnce(query, opts);
  } catch (error) {
    if (!(error instanceof GoogleSearchError) || /not configured/.test(error.message)) throw error;
    return googleSearchOnce(query, opts);
  }
}
