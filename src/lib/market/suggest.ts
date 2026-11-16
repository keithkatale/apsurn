import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiClient } from "@/lib/ai/openai";
import { MAX_LISTENING_KEYWORDS, parseListeningKeywords, type ListeningKeyword } from "./suggest-core";
import { DEFAULT_MARKET_PLATFORMS } from "./types";

const KEYWORD_CAP = 20;

interface BlueprintContext {
  productSummary: string | null;
  valueProp: string | null;
  industries: string[];
  personaTitles: string[];
  competitors: string[];
}

export type { ListeningKeyword };

/** Phrases a buyer would actually post, each tagged with the intent that makes it a lead. */
export async function suggestListeningKeywords(context: BlueprintContext, avoid: string[] = []): Promise<ListeningKeyword[]> {
  const { ai, model } = await getAiClient();
  const avoided = avoid
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((line) => `- ${line.slice(0, 160)}`)
    .join("\n");
  const response = await ai.responses.create({
    model,
    max_output_tokens: 900,
    text: { format: { type: "json_object" } },
    input: `You choose search phrases for social listening on X, LinkedIn, Reddit, and Hacker News. The goal is to find people publicly talking about a problem the product below solves, so they can be approached as prospects.

Product: ${context.productSummary ?? "unknown"}
Value proposition: ${context.valueProp ?? "unknown"}
Target industries: ${context.industries.join(", ") || "unknown"}
Buyer titles: ${context.personaTitles.join(", ") || "unknown"}
Competitors: ${context.competitors.join(", ") || "none known"}
${avoided ? `\nThe user dismissed conversations like these. Do not propose phrases that would surface the same kind of post:\n${avoided}\n` : ""}
Return JSON: {"keywords":[{"phrase":"...","intent":"tool_recommendation"|"competitor_churn"|"workflow_pain"|"hiring_growth"}]}
with up to ${MAX_LISTENING_KEYWORDS} short phrases (2 to 6 words). Mix the pain in a buyer's own words (workflow_pain), "looking for" asks (tool_recommendation), "alternative to / switching from" a competitor (competitor_churn), and at most one hiring phrase (hiring_growth). No hashtags. No generic single words like "marketing" or "sales".`,
  });
  return parseListeningKeywords(response.output_text ?? "");
}

async function blueprintContext(db: SupabaseClient, companyId: string): Promise<BlueprintContext | null> {
  const { data: bp } = await db
    .from("company_blueprints")
    .select("icp, personas, value_prop, product_summary, competitors")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!bp) return null;
  return {
    productSummary: bp.product_summary ?? null,
    valueProp: bp.value_prop ?? null,
    industries: bp.icp?.industries ?? [],
    personaTitles: (bp.personas ?? []).map((p: { title?: string }) => p.title).filter(Boolean),
    competitors: bp.competitors ?? [],
  };
}

async function insertKeywords(db: SupabaseClient, userId: string, companyId: string, keywords: ListeningKeyword[]): Promise<number> {
  if (keywords.length === 0) return 0;
  const rows = keywords.map((item) => ({
    user_id: userId,
    company_id: companyId,
    keyword: item.keyword,
    intent: item.intent,
    platforms: DEFAULT_MARKET_PLATFORMS,
  }));
  const { error } = await db.from("market_keywords").upsert(rows, { onConflict: "company_id,keyword", ignoreDuplicates: true });
  if (error) {
    console.warn("[market] could not save suggested keywords:", error.message);
    return 0;
  }
  return keywords.length;
}

/**
 * Gives a company a starting set of listening keywords the first time it has none.
 * Safe to call repeatedly; existing phrases are left in place.
 */
export async function seedListeningKeywords(db: SupabaseClient, userId: string, companyId: string): Promise<number> {
  const { count } = await db.from("market_keywords").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  if ((count ?? 0) > 0) return 0;
  const context = await blueprintContext(db, companyId);
  if (!context) return 0;
  let keywords: ListeningKeyword[] = [];
  try {
    keywords = await suggestListeningKeywords(context);
  } catch (error) {
    console.warn("[market] keyword suggestion failed:", error instanceof Error ? error.message : error);
    return 0;
  }
  return insertKeywords(db, userId, companyId, keywords);
}

/** Adds phrases the current set missed. Dismissed conversations are passed in so the same noise is not searched again. */
export async function regenerateListeningKeywords(db: SupabaseClient, userId: string, companyId: string): Promise<number> {
  const context = await blueprintContext(db, companyId);
  if (!context) return 0;
  const [{ data: existing }, { data: dismissed }] = await Promise.all([
    db.from("market_keywords").select("keyword").eq("company_id", companyId),
    db.from("market_mentions").select("content, qualify_reason").eq("company_id", companyId).eq("status", "dismissed").order("created_at", { ascending: false }).limit(8),
  ]);
  const owned = new Set((existing ?? []).map((row) => String(row.keyword).toLowerCase()));
  if (owned.size >= KEYWORD_CAP) return 0;
  const avoid = (dismissed ?? [])
    .map((row) => String(row.qualify_reason || row.content || "").trim())
    .filter(Boolean);
  let keywords: ListeningKeyword[] = [];
  try {
    keywords = await suggestListeningKeywords(context, avoid);
  } catch (error) {
    console.warn("[market] keyword retune failed:", error instanceof Error ? error.message : error);
    return 0;
  }
  const fresh = keywords.filter((item) => !owned.has(item.keyword.toLowerCase())).slice(0, KEYWORD_CAP - owned.size);
  const before = owned.size;
  await insertKeywords(db, userId, companyId, fresh);
  const { count } = await db.from("market_keywords").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  return Math.max(0, (count ?? before) - before);
}

/** Active listening keywords for a user's company, used to steer social-signal prospecting. */
export async function activeListeningKeywords(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return [];
  const { data } = await db.from("market_keywords").select("keyword").eq("company_id", company.id).eq("is_active", true).limit(12);
  return (data ?? []).map((row) => row.keyword as string);
}
