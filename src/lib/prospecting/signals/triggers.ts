/** Parses model/UI-supplied trigger specs into clean TriggerSpecs. Pure — no runtime imports (triggers.test.ts). */
import type { TriggerEventKind, TriggerSpec, TriggerType } from "../types";

export const TRIGGER_TYPES: readonly TriggerType[] = ["hiring", "funding_news", "social_pain", "tech_website"];
const EVENT_KINDS: readonly TriggerEventKind[] = ["funding", "launch", "expansion", "exec_hire"];
export const DEFAULT_RECENCY_DAYS = 30;
const MAX_RECENCY_DAYS = 180;

function strings(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, max);
}

/** Unknown trigger types are dropped (not guessed at); each type appears once, first spec wins. */
export function parseTriggers(value: unknown): TriggerSpec[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<TriggerType>();
  const out: TriggerSpec[] = [];
  for (const raw of value) {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    const type = row?.type;
    if (!row || typeof type !== "string" || !(TRIGGER_TYPES as readonly string[]).includes(type) || seen.has(type as TriggerType)) continue;
    seen.add(type as TriggerType);

    const recency = Number(row.recencyDays);
    const recencyDays = Number.isFinite(recency) && recency > 0 ? Math.min(MAX_RECENCY_DAYS, Math.floor(recency)) : DEFAULT_RECENCY_DAYS;
    const spec: TriggerSpec = { type: type as TriggerType, recencyDays };
    const keywords = strings(row.keywords, 12);
    const roles = strings(row.roles, 12);
    const competitors = strings(row.competitors, 12);
    const eventKinds = strings(row.eventKinds, 4).filter((kind): kind is TriggerEventKind => (EVENT_KINDS as readonly string[]).includes(kind));
    if (keywords.length) spec.keywords = keywords;
    if (roles.length) spec.roles = roles;
    if (competitors.length) spec.competitors = competitors;
    if (eventKinds.length) spec.eventKinds = eventKinds;
    out.push(spec);
  }
  return out;
}
