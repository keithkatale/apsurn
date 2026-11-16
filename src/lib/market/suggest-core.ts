import type { RadarIntent } from "./types";

export const MAX_LISTENING_KEYWORDS = 12;

export interface ListeningKeyword {
  keyword: string;
  intent: RadarIntent;
}

const RADAR_INTENTS = ["tool_recommendation", "competitor_churn", "workflow_pain", "hiring_growth"] as const satisfies readonly RadarIntent[];
const INTENT_SET = new Set<string>(RADAR_INTENTS);

export function intentFromPhrase(phrase: string): RadarIntent {
  const lower = phrase.toLowerCase();
  if (/\b(alternative|switch|replacing|vs)\b/.test(lower)) return "competitor_churn";
  if (/\b(hiring|hire|headcount)\b/.test(lower)) return "hiring_growth";
  if (/\b(looking for|recommend|alternative|tool for|software for)\b/.test(lower)) return "tool_recommendation";
  return "workflow_pain";
}

function asIntent(value: unknown, phrase: string): RadarIntent {
  if (typeof value === "string" && INTENT_SET.has(value)) return value as RadarIntent;
  return intentFromPhrase(phrase);
}

/** Pulls a qualify profile out of a model response. Accepts phrase strings or {phrase, intent} objects. */
export function parseListeningKeywords(text: string): ListeningKeyword[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { keywords?: unknown };
    if (!Array.isArray(parsed.keywords)) return [];
    const seen = new Set<string>();
    const out: ListeningKeyword[] = [];
    for (const item of parsed.keywords) {
      const phrase = typeof item === "string" ? item : item && typeof item === "object" && typeof (item as { phrase?: unknown }).phrase === "string" ? (item as { phrase: string }).phrase : "";
      const keyword = phrase.trim().replace(/\s+/g, " ");
      const key = keyword.toLowerCase();
      if (keyword.length < 3 || keyword.length > 80 || seen.has(key)) continue;
      seen.add(key);
      const intent = typeof item === "object" && item ? asIntent((item as { intent?: unknown }).intent, keyword) : intentFromPhrase(keyword);
      out.push({ keyword, intent });
    }
    return out.slice(0, MAX_LISTENING_KEYWORDS);
  } catch {
    return [];
  }
}
