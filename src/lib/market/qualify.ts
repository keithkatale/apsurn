import { getAiClient } from "@/lib/ai/openai";
import { heuristicQualify, MIN_QUALIFY_SCORE, type HeuristicVerdict } from "./qualify-core";
import { RADAR_INTENTS, type RadarIntent } from "./types";

export interface QualifyContext {
  productSummary: string | null;
  valueProp: string | null;
  industries: string[];
  personaTitles: string[];
  competitors: string[];
}

export interface MentionToQualify {
  key: string;
  platform: string;
  author: string | null;
  content: string;
}

export interface QualifiedMention {
  key: string;
  score: number;
  intent: RadarIntent;
  reason: string;
  opener: string;
  reject: boolean;
}

const BATCH = 8;
const INTENTS = new Set<string>(RADAR_INTENTS);

function openerFor(verdict: HeuristicVerdict, author: string | null): string {
  const who = author ? author.replace(/^@/, "") : "there";
  if (verdict.intent === "competitor_churn") {
    return `Hi ${who} — saw you're weighing a switch. Happy to share how teams in your spot handled the move, if that's useful.`;
  }
  if (verdict.intent === "hiring_growth") {
    return `Hi ${who} — noticed you're growing the team. If the workload behind that hire is the real problem, I can show you what we do about it.`;
  }
  if (verdict.intent === "workflow_pain") {
    return `Hi ${who} — your note about this problem sounded familiar. We help with that exact headache. Open to a quick look?`;
  }
  return `Hi ${who} — saw you asking for a tool for this. We built something for that. Want me to point you at the relevant part?`;
}

function fromHeuristic(item: MentionToQualify, competitors: string[]): QualifiedMention {
  const verdict = heuristicQualify(item.content, competitors);
  const reject = verdict.reject || verdict.score < MIN_QUALIFY_SCORE;
  return {
    key: item.key,
    score: verdict.score,
    intent: verdict.intent,
    reason: verdict.reason,
    opener: openerFor(verdict, item.author),
    reject,
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function parseVerdicts(text: string): Array<Record<string, unknown>> {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  const arrayStart = cleaned.indexOf("[");
  const objectStart = cleaned.indexOf("{");
  const useArray = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart);
  const start = useArray ? arrayStart : objectStart;
  const end = cleaned.lastIndexOf(useArray ? "]" : "}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
    if (Array.isArray(parsed)) return parsed.map(asObject).filter((row): row is Record<string, unknown> => Boolean(row));
    const object = asObject(parsed);
    const list = object?.results ?? object?.mentions ?? object?.items;
    if (!Array.isArray(list)) return [];
    return list.map(asObject).filter((row): row is Record<string, unknown> => Boolean(row));
  } catch {
    return [];
  }
}

function readVerdict(row: Record<string, unknown> | undefined, fallback: QualifiedMention): QualifiedMention {
  if (!row) return fallback;
  const score = typeof row.score === "number" ? Math.max(0, Math.min(100, Math.round(row.score))) : fallback.score;
  const intent = typeof row.intent === "string" && INTENTS.has(row.intent) ? (row.intent as RadarIntent) : fallback.intent;
  const reason = typeof row.reason === "string" && row.reason.trim() ? row.reason.trim().slice(0, 280) : fallback.reason;
  const opener = typeof row.opener === "string" && row.opener.trim() ? row.opener.trim().slice(0, 400) : fallback.opener;
  const reject = row.reject === true || score < MIN_QUALIFY_SCORE;
  return { key: fallback.key, score, intent, reason, opener, reject };
}

async function judgeBatch(context: QualifyContext, batch: MentionToQualify[], fallbacks: QualifiedMention[]): Promise<QualifiedMention[]> {
  const { ai, model } = await getAiClient();
  const posts = batch
    .map((item, index) => `${index + 1}. [${item.platform}] ${item.author ?? "unknown"}: ${item.content.slice(0, 500)}`)
    .join("\n");
  const response = await ai.responses.create({
    model,
    max_output_tokens: 2500,
    input: `You qualify public social posts as sales conversations for this company.

Product: ${context.productSummary ?? "unknown"}
Value proposition: ${context.valueProp ?? "unknown"}
Industries: ${context.industries.join(", ") || "unknown"}
Buyers: ${context.personaTitles.join(", ") || "unknown"}
Competitors: ${context.competitors.join(", ") || "none known"}

Reject the post when the author is selling a similar product, job hunting, or not someone who might buy. Score 0-100. Under ${MIN_QUALIFY_SCORE} must set reject to true.

${posts}

Return ONLY a JSON array of ${batch.length} objects, in order, no markdown:
{"score":0,"intent":"tool_recommendation|competitor_churn|workflow_pain|hiring_growth","reason":"one sentence tied to this product","opener":"one or two sentences the user can send","reject":false}`,
  });
  const rows = parseVerdicts(response.output_text ?? "");
  return fallbacks.map((fallback, index) => readVerdict(rows[index], fallback));
}

/** Scores each post against the company. A failed model call keeps the heuristic verdict. */
export async function qualifyMentions(context: QualifyContext, items: MentionToQualify[]): Promise<QualifiedMention[]> {
  const out: QualifiedMention[] = [];
  for (let offset = 0; offset < items.length; offset += BATCH) {
    const batch = items.slice(offset, offset + BATCH);
    const fallbacks = batch.map((item) => fromHeuristic(item, context.competitors));
    try {
      out.push(...(await judgeBatch(context, batch, fallbacks)));
    } catch (error) {
      console.warn("[radar] qualify failed:", error instanceof Error ? error.message : error);
      out.push(...fallbacks);
    }
  }
  return out;
}
