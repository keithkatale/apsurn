/**
 * Pure ranking of signal candidates into leads. No runtime `@/` imports so it
 * runs under node:test (score.test.ts).
 */
import type { TriggerType } from "../types";
import type { ScoredLead, SignalCandidate } from "./types";

/** How much each trigger says about intent to buy now. Funding is cash in hand; tech fit is weakest on its own. */
export const TRIGGER_WEIGHT: Record<TriggerType, number> = {
  funding_news: 1,
  hiring: 0.9,
  social_pain: 0.85,
  tech_website: 0.6,
};

const DAY_MS = 86_400_000;

export function ageInDays(eventDate: string | null, now: number): number | null {
  if (!eventDate) return null;
  const time = Date.parse(eventDate);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (now - time) / DAY_MS);
}

/** 1.0 for today, decaying toward 0 over the recency window; an undated signal counts as middling. */
export function recencyFactor(eventDate: string | null, recencyDays: number, now: number): number {
  const age = ageInDays(eventDate, now);
  if (age === null) return 0.5;
  return Math.exp(-age / Math.max(1, recencyDays));
}

export function scoreSignal(candidate: SignalCandidate, recencyDays: number, now: number): number {
  const strength = Math.min(1, Math.max(0, candidate.strength));
  return TRIGGER_WEIGHT[candidate.triggerType] * recencyFactor(candidate.eventDate, recencyDays, now) * (0.5 + 0.5 * strength);
}

/** Stable id for "this signal" so recurring scans never report the same event twice. */
export function eventKey(candidate: Pick<SignalCandidate, "domain" | "triggerType" | "headline" | "sourceUrl">): string {
  const headline = candidate.headline
    .toLowerCase()
    .replace(/\(posted [^)]*\)/g, "")
    .replace(/\b\d+\s*d(ays?)?\s*ago\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const anchor = candidate.sourceUrl ? candidate.sourceUrl.toLowerCase().replace(/[?#].*$/, "") : headline;
  return `${candidate.domain ?? "?"}|${candidate.triggerType}|${anchor}`.slice(0, 400);
}

/** "Hiring 3 SDRs (posted 9d ago); Raised a $12M Series A" — strongest signal of each type first. */
export function qualifyReasonFor(signals: SignalCandidate[]): string {
  const seen = new Set<TriggerType>();
  const parts: string[] = [];
  for (const signal of signals) {
    if (seen.has(signal.triggerType)) continue;
    seen.add(signal.triggerType);
    parts.push(signal.headline.trim().replace(/[.;]+$/, ""));
    if (parts.length === 2) break;
  }
  const reason = parts.join("; ");
  return reason.length > 280 ? `${reason.slice(0, 277)}…` : reason;
}

/**
 * Groups candidates by domain and ranks companies. The best signal of each
 * trigger type is combined as independent evidence (noisy-OR: 1 − Π(1 − sᵢ)),
 * so two different reasons to buy now outrank one slightly stronger reason —
 * while repeats of the same trigger type (three job posts) don't stack.
 */
export function rankLeads(candidates: SignalCandidate[], recencyByType: Partial<Record<TriggerType, number>>, now: number): ScoredLead[] {
  const byDomain = new Map<string, SignalCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.domain) continue;
    const domain = candidate.domain.toLowerCase();
    const list = byDomain.get(domain) ?? [];
    list.push(candidate);
    byDomain.set(domain, list);
  }

  const leads: ScoredLead[] = [];
  for (const [domain, signals] of byDomain) {
    const scored = signals
      .map((signal) => ({ signal, score: scoreSignal(signal, recencyByType[signal.triggerType] ?? 30, now) }))
      .sort((a, b) => b.score - a.score);
    const bestByType = new Map<TriggerType, number>();
    for (const row of scored) {
      if (!bestByType.has(row.signal.triggerType)) bestByType.set(row.signal.triggerType, row.score);
    }
    const combined = 1 - [...bestByType.values()].reduce((miss, score) => miss * (1 - Math.min(1, score)), 1);
    const ordered = scored.map((row) => row.signal);
    leads.push({
      domain,
      companyName: ordered[0].companyName,
      signals: ordered,
      score: combined,
      qualifyReason: qualifyReasonFor(ordered),
    });
  }
  return leads.sort((a, b) => b.score - a.score);
}
