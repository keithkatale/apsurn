import { getAiClient } from "@/lib/ai/openai";
import { webSearchMany, type WebSearchResult } from "@/lib/search/web-search";
import { fetchPage } from "@/lib/scraper/fetch-page";
import type { ProspectCriteria, TriggerEventKind, TriggerSpec } from "../types";
import { resolveCompanyDomain } from "./domain";
import { filterByIcpFit } from "./fit";
import { buildNewsQueries, dateFromUrl, parseProposedEvents, publishedDateFromHtml, validateEvents, type ValidEvent } from "./news-core";
import type { SignalCandidate } from "./types";

const MAX_RESULTS_SHOWN = 40;
const DOMAIN_LOOKUP_CONCURRENCY = 4;
const DATE_FETCH_CONCURRENCY = 4;
const MAX_DATE_FETCHES = 24;
const STRENGTH: Record<TriggerEventKind, number> = { funding: 0.9, exec_hire: 0.7, launch: 0.6, expansion: 0.6 };

function extractionPrompt(results: WebSearchResult[], kinds: TriggerEventKind[], now: Date): string {
  const numbered = results.map((result, i) => `${i + 1}. ${result.title}\n   ${result.url}\n   ${result.snippet}`).join("\n");
  return `Today is ${now.toISOString().slice(0, 10)}. Below are numbered web search results. List company events that a result EXPLICITLY states: ${kinds.join(", ")}.

Rules:
- Only include an event if that numbered result's own text says it. Never use outside knowledge, and never infer.
- "company" is the company the event happened to, exactly as the result names it.
- "date": leave null. Dates are read from the articles separately.
- "sourceIndex" is the number of the result that states the event.
- "kind" is one of: funding, launch, expansion, exec_hire. "amount" only for funding, as written (e.g. "$12M").
- Skip roundups, rankings and lists of many companies.

Results:
${numbered}

Reply with ONLY JSON: {"events":[{"company":"","event":"one short factual sentence","kind":"funding","amount":null,"date":"YYYY-MM-DD","sourceIndex":1}]}`;
}

/** Companies in the news for a funding round, launch, expansion or key hire, each tied to the article that says so. */
export async function collectNewsSignals(opts: {
  criteria: ProspectCriteria;
  spec: TriggerSpec;
  known: Set<string>;
  want: number;
  productSummary?: string | null;
  shouldStop: () => boolean;
}): Promise<SignalCandidate[]> {
  const { criteria, spec, known, want, shouldStop } = opts;
  const now = new Date();
  const kinds: TriggerEventKind[] = spec.eventKinds?.length ? spec.eventKinds : ["funding"];

  const queries = buildNewsQueries({ industries: criteria.industries, keywords: spec.keywords ?? [], eventKinds: kinds, now, recencyDays: spec.recencyDays });
  const results = (await webSearchMany(queries, 10)).slice(0, MAX_RESULTS_SHOWN);
  if (results.length === 0 || shouldStop()) return [];

  const { ai, model } = await getAiClient();
  const response = await ai.responses.create({
    model,
    thinking_budget: 0,
    max_output_tokens: 3000,
    text: { format: { type: "json_object" } },
    input: extractionPrompt(results, kinds, now),
  });
  const proposed = parseProposedEvents(String(response.output_text ?? ""));
  if (!proposed) {
    console.warn("[signals] news extraction reply unusable");
    return [];
  }

  // The article's own date is the event date. URL dates are free; for the rest, read the page's
  // published-time metadata, but only for results an event actually cites.
  const published = new Map<string, number>();
  const toFetch = [...new Set(proposed.map((event) => results[event.sourceIndex - 1]?.url).filter((url): url is string => Boolean(url) && !dateFromUrl(url)))].slice(0, MAX_DATE_FETCHES);
  let dateCursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(DATE_FETCH_CONCURRENCY, toFetch.length) }, async () => {
      for (;;) {
        if (shouldStop()) return;
        const url = toFetch[dateCursor++];
        if (!url) return;
        try {
          const page = await fetchPage(url, { render: false });
          const time = page ? publishedDateFromHtml(page.html) : null;
          if (time !== null) published.set(url, time);
        } catch {
          // An unreachable article simply has no verified date, so its events are dropped.
        }
      }
    }),
  );

  const valid = validateEvents(proposed, results, spec.recencyDays, now, published).slice(0, want);

  const resolved: SignalCandidate[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(DOMAIN_LOOKUP_CONCURRENCY, valid.length) }, async () => {
      for (;;) {
        if (shouldStop()) return;
        const event: ValidEvent | undefined = valid[cursor++];
        if (!event) return;
        const domain = await resolveCompanyDomain(event.company);
        if (!domain || known.has(domain)) continue;
        resolved.push({
          companyName: event.company,
          domain,
          triggerType: "funding_news",
          headline: event.headline,
          sourceUrl: event.sourceUrl,
          excerpt: event.excerpt,
          eventDate: event.date,
          strength: STRENGTH[event.kind],
          industry: null,
          location: null,
          companySize: null,
        });
      }
    }),
  );

  const byDomain = new Map<string, SignalCandidate>();
  for (const candidate of resolved) if (candidate.domain && !byDomain.has(candidate.domain)) byDomain.set(candidate.domain, candidate);
  return filterByIcpFit([...byDomain.values()], criteria, opts.productSummary);
}
