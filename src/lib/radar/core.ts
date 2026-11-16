/** Pure radar logic. No runtime `@/` imports so it runs under node:test. */
import type { RadarSignalType, RawSignal } from "./types";

const MIN = 60_000;
const DAY_MS = 86_400_000;

export function canonicalUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const kept = [...url.searchParams.entries()]
      .filter(([name]) => !/^(utm_|ref$|fbclid$|gclid$|mc_)/i.test(name))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => `${name}=${value}`)
      .join("&");
    const path = `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`;
    return (kept ? `${path}?${kept}` : path).toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

export function dedupeKey(signal: Pick<RawSignal, "source" | "url">): string {
  return `${signal.source}|${canonicalUrl(signal.url)}`.slice(0, 400);
}

/** 5 minutes after the first failure, doubling per further failure, capped at 6 hours. */
export function backoffMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  return Math.min(6 * 60 * MIN, 5 * MIN * 2 ** (consecutiveFailures - 1));
}

export function isBackedOff(backoffUntil: string | null, now: number): boolean {
  if (!backoffUntil) return false;
  const until = Date.parse(backoffUntil);
  return Number.isFinite(until) && until > now;
}

/** A source runs again only once its own minimum gap has passed since the last success. */
export function sourceIsDue(lastOkAt: string | null, minIntervalMs: number, now: number): boolean {
  if (!lastOkAt) return true;
  const last = Date.parse(lastOkAt);
  return !Number.isFinite(last) || now - last >= minIntervalMs;
}

export function nextRunAt(cadenceMinutes: number, now: number): string {
  return new Date(now + Math.max(30, cadenceMinutes) * MIN).toISOString();
}

/** What each kind of event says about buying soon, before any text judgement. */
export const TYPE_WEIGHT: Record<RadarSignalType, number> = {
  funding: 0.95,
  buying_intent: 0.9,
  competitor_churn: 0.9,
  hiring: 0.8,
  workflow_pain: 0.75,
  launch: 0.7,
  news: 0.6,
  developer_activity: 0.5,
};

/** Days over which an event of this type stops being fresh. */
export const RECENCY_DAYS: Record<RadarSignalType, number> = {
  funding: 45,
  hiring: 30,
  buying_intent: 7,
  competitor_churn: 10,
  workflow_pain: 10,
  launch: 21,
  news: 14,
  developer_activity: 30,
};

/** 0-100 score for event-style signals (hiring, funding, news) that need no language judgement. */
export function eventScore(type: RadarSignalType, eventAt: string | null, now: number): number {
  const time = eventAt ? Date.parse(eventAt) : Number.NaN;
  const ageDays = Number.isFinite(time) ? Math.max(0, (now - time) / DAY_MS) : null;
  const recency = ageDays === null ? 0.5 : Math.exp(-ageDays / RECENCY_DAYS[type]);
  return Math.round(100 * TYPE_WEIGHT[type] * (0.4 + 0.6 * recency));
}

/** Types whose text must be judged for real buying intent rather than scored by event alone. */
export function needsTextJudgement(type: RadarSignalType): boolean {
  return type === "buying_intent" || type === "competitor_churn" || type === "workflow_pain";
}

export function autoSourceBudget(usedToday: number, dailyCap: number): number {
  return Math.max(0, dailyCap - usedToday);
}

export function matchesAny(text: string, phrases: string[]): string | null {
  const lower = text.toLowerCase();
  for (const phrase of phrases) {
    const needle = phrase.trim().toLowerCase();
    if (needle.length >= 2 && lower.includes(needle)) return phrase;
  }
  return null;
}

export function dedupeSignals<T extends Pick<RawSignal, "source" | "url">>(signals: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const signal of signals) {
    const key = dedupeKey(signal);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(signal);
  }
  return out;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(br|p|li)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
