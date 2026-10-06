/**
 * Funding / launch / expansion / exec-hire signals from web search. A model
 * reads search results and proposes events; this file decides which of those
 * proposals are believable. The rule is simple and strict: an event survives
 * only if the cited result itself mentions the company, the event has a date,
 * and the date is inside the window. Pure; no runtime imports (news.test.ts).
 */
import type { TriggerEventKind } from "../types.ts";
import { companyKey } from "./domain-core.ts";

export interface NewsResult {
  url: string;
  title: string;
  snippet: string;
}

/** What the model returns per event; `sourceIndex` is 1-based into the numbered results it was shown. */
export interface ProposedEvent {
  company: string;
  event: string;
  kind?: string;
  amount?: string | null;
  date: string | null;
  sourceIndex: number;
}

export interface ValidEvent {
  company: string;
  headline: string;
  kind: TriggerEventKind;
  date: string;
  sourceUrl: string;
  excerpt: string;
}

const KINDS: readonly TriggerEventKind[] = ["funding", "launch", "expansion", "exec_hire"];

/** Pages that list many companies or cover a whole sector are not evidence about one company. */
const ROUNDUP_PATH = /\/(tag|tags|topic|topics|category|categories|search|archive|archives|newsletter|roundup|list|lists)\b|\/\d{4}\/\d{2}\/?$/i;
// Slugs of pages that cover many companies: "weekly-notable-startup-funding-report", "funding-rounds-by-month", "top-10-…".
const ROUNDUP_SLUG = /(weekly|monthly|quarterly|roundup|round-up|recap|digest|funding-report|rounds-by|top-\d+|best-\d+|largest|biggest|startups-with|list-of|series-[abc]-startups|startups-to-watch|tracker|this-weeks?|last-weeks?|week-in|deal-scene|across-\d+|\d+-deals|deals-of|funding-rounds)/i;
const ROUNDUP_TITLE = /\b(top \d+|best \d+|weekly (recap|roundup)|funding (roundup|news|tracker)|this week in|the week in|biggest (rounds|deals))\b/i;

export function monthsInWindow(now: Date, recencyDays: number): string[] {
  const names: string[] = [];
  const cursor = new Date(now.getTime());
  const earliest = now.getTime() - recencyDays * 86_400_000;
  for (let guard = 0; guard < 8; guard++) {
    names.push(cursor.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }));
    cursor.setUTCDate(1);
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
    if (cursor.getTime() < earliest - 31 * 86_400_000) break;
  }
  return [...new Set(names)];
}

/** Grounded-search queries, phrased the way news headlines are. */
export function buildNewsQueries(opts: { industries: string[]; keywords: string[]; eventKinds: TriggerEventKind[]; now: Date; recencyDays: number }): string[] {
  const topics = [...opts.keywords, ...opts.industries].filter(Boolean).slice(0, 3);
  const kinds = opts.eventKinds.length ? opts.eventKinds : (["funding"] as TriggerEventKind[]);
  const months = monthsInWindow(opts.now, opts.recencyDays).slice(0, 2);
  const phrase: Record<TriggerEventKind, string> = {
    funding: "startup raises funding round Series A OR seed OR Series B announced",
    launch: "company launches new product announced",
    expansion: "company expands opens new office or enters new market announced",
    exec_hire: "company appoints new Chief Revenue Officer OR VP Sales OR Head of Growth",
  };
  const queries: string[] = [];
  for (const kind of kinds) {
    for (const topic of topics.length ? topics : [""]) {
      for (const month of months) queries.push(`${topic} ${phrase[kind]} ${month}`.replace(/\s+/g, " ").trim());
    }
  }
  return queries.slice(0, 6);
}

/** The model returns amounts as "$12M" or as a bare number (42000000); show both as "$42M". */
export function formatAmount(value: unknown): string | null {
  if (typeof value === "string") return value.trim().slice(0, 40) || null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const compact = (n: number, unit: string) => `$${Number.isInteger(n) ? n : n.toFixed(1)}${unit}`;
  if (value >= 1e9) return compact(value / 1e9, "B");
  if (value >= 1e6) return compact(value / 1e6, "M");
  if (value >= 1e3) return compact(value / 1e3, "K");
  return `$${value}`;
}

export function parseProposedEvents(text: string): ProposedEvent[] | null {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  const events = (parsed as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) return null;
  const out: ProposedEvent[] = [];
  for (const row of events) {
    const e = row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    if (!e || typeof e.company !== "string" || typeof e.event !== "string") continue;
    const sourceIndex = Number(e.sourceIndex);
    if (!Number.isInteger(sourceIndex) || sourceIndex < 1) continue;
    out.push({
      company: e.company.trim().slice(0, 120),
      event: e.event.trim().slice(0, 240),
      kind: typeof e.kind === "string" ? e.kind : undefined,
      amount: formatAmount(e.amount),
      date: typeof e.date === "string" && e.date.trim() ? e.date.trim() : null,
      sourceIndex,
    });
  }
  return out;
}

/** A full date in the URL: /2026/10/01/slug, /2026-10-01-slug, or a compact 20261005 id. */
export function dateFromUrl(url: string): number | null {
  const spaced = url.match(/[/-](20\d{2})[/-](0[1-9]|1[0-2])[/-](0[1-9]|[12]\d|3[01])(?=[/-]|$|\?|\.)/);
  const compact = url.match(/[/_-](20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?=[a-z/_.-]|$)/i);
  const match = spaced ?? compact;
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(time) ? time : null;
}

/** Month-only URLs (/2026/10/slug) prove the month, not the day; the first of the month is the conservative reading. */
export function monthFromUrl(url: string): number | null {
  const match = url.match(/\/(20\d{2})\/(0[1-9]|1[0-2])\//);
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, 1) : null;
}

/** The article's own publication date from page metadata, or null. Pure string work over the HTML. */
export function publishedDateFromHtml(html: string): number | null {
  const patterns = [
    /<meta[^>]+(?:property|name|itemprop)=["'](?:article:published_time|og:published_time|datePublished|pubdate|date|DC\.date\.issued)["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["'](?:article:published_time|og:published_time|datePublished|pubdate|date)["']/i,
    /"datePublished"\s*:\s*"([^"]+)"/i,
    /<time[^>]+datetime=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1];
    const time = value ? Date.parse(value) : NaN;
    if (Number.isFinite(time)) return time;
  }
  return null;
}

/** Where an article's date comes from, best evidence first. A model-written date is never used: it fills in "today". */
export function articleDate(url: string, pagePublished: number | null | undefined): number | null {
  return dateFromUrl(url) ?? pagePublished ?? monthFromUrl(url);
}

/** The believable subset of proposed events, each tied to the result that supports it. */
export function validateEvents(
  proposed: ProposedEvent[],
  results: NewsResult[],
  recencyDays: number,
  now: Date,
  /** Publication dates read from the fetched pages, keyed by URL. */
  published: Map<string, number> = new Map(),
): ValidEvent[] {
  const earliest = now.getTime() - recencyDays * 86_400_000;
  const latest = now.getTime() + 86_400_000; // a day of slack for timezones; not the future
  const seen = new Set<string>();
  const valid: ValidEvent[] = [];

  for (const event of proposed) {
    const source = results[event.sourceIndex - 1];
    if (!source) continue;

    const time = articleDate(source.url, published.get(source.url));
    if (time === null || time < earliest || time > latest) continue;

    const key = companyKey(event.company);
    if (key.length < 3) continue;
    // The cited page must itself name the company — the model's say-so isn't evidence.
    const haystack = companyKey(`${source.title} ${source.snippet}`);
    if (!haystack.includes(key)) continue;

    let pathname = "";
    try {
      pathname = new URL(source.url).pathname;
    } catch {
      continue;
    }
    if (pathname === "/" || pathname === "" || ROUNDUP_PATH.test(pathname) || ROUNDUP_SLUG.test(pathname) || ROUNDUP_TITLE.test(source.title)) continue;

    const dedupe = `${key}|${event.kind ?? ""}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const kind = (KINDS as readonly string[]).includes(event.kind ?? "") ? (event.kind as TriggerEventKind) : "funding";
    const amount = event.amount ? ` (${event.amount})` : "";
    valid.push({
      company: event.company,
      headline: `${event.event.replace(/[.;]+$/, "")}${amount}`.slice(0, 200),
      kind,
      date: new Date(time).toISOString(),
      sourceUrl: source.url,
      excerpt: (source.snippet || source.title).slice(0, 300),
    });
  }
  return valid;
}
