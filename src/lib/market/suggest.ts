import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiClient } from "@/lib/ai/openai";
import { DEFAULT_MARKET_PLATFORMS } from "./types";

const MAX_KEYWORDS = 8;

interface BlueprintContext {
  productSummary: string | null;
  valueProp: string | null;
  industries: string[];
  personaTitles: string[];
  competitors: string[];
}

function parseKeywords(text: string): string[] {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { keywords?: unknown };
    if (!Array.isArray(parsed.keywords)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed.keywords) {
      const value = typeof item === "string" ? item.trim().replace(/\s+/g, " ") : "";
      if (value.length < 3 || value.length > 80 || seen.has(value.toLowerCase())) continue;
      seen.add(value.toLowerCase());
      out.push(value);
    }
    return out.slice(0, MAX_KEYWORDS);
  } catch {
    return [];
  }
}

/** Phrases a buyer would actually post: the problem in their words, switching intent, and competitor names. */
export async function suggestListeningKeywords(context: BlueprintContext): Promise<string[]> {
  const { ai, model } = await getAiClient();
  const response = await ai.responses.create({
    model,
    max_output_tokens: 600,
    text: { format: { type: "json_object" } },
    input: `You choose search phrases for social listening on X, LinkedIn and Reddit, to find people who are publicly talking about a problem the product below solves, so they can be approached as prospects.

Product: ${context.productSummary ?? "unknown"}
Value proposition: ${context.valueProp ?? "unknown"}
Target industries: ${context.industries.join(", ") || "unknown"}
Buyer titles: ${context.personaTitles.join(", ") || "unknown"}
Competitors: ${context.competitors.join(", ") || "none known"}

Return JSON: {"keywords": [...]} with up to ${MAX_KEYWORDS} short phrases (2 to 6 words) in a mix of: the pain in a buyer's own words, "looking for / alternative to" intent phrases, and competitor names. No hashtags, no generic words like "marketing" or "sales" alone.`,
  });
  return parseKeywords(response.output_text ?? "");
}

/**
 * Gives a company a starting set of listening keywords the first time it has none, so prospecting and the
 * Market research tab work without setup. Safe to call repeatedly; returns how many were added.
 */
export async function seedListeningKeywords(db: SupabaseClient, userId: string, companyId: string): Promise<number> {
  const { count } = await db.from("market_keywords").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  if ((count ?? 0) > 0) return 0;
  const { data: bp } = await db
    .from("company_blueprints")
    .select("icp, personas, value_prop, product_summary, competitors")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!bp) return 0;
  let keywords: string[] = [];
  try {
    keywords = await suggestListeningKeywords({
      productSummary: bp.product_summary ?? null,
      valueProp: bp.value_prop ?? null,
      industries: bp.icp?.industries ?? [],
      personaTitles: (bp.personas ?? []).map((p: { title?: string }) => p.title).filter(Boolean),
      competitors: bp.competitors ?? [],
    });
  } catch (error) {
    console.warn("[market] keyword suggestion failed:", error instanceof Error ? error.message : error);
    return 0;
  }
  if (keywords.length === 0) return 0;
  const { error } = await db.from("market_keywords").insert(
    keywords.map((keyword) => ({ user_id: userId, company_id: companyId, keyword, platforms: DEFAULT_MARKET_PLATFORMS })),
  );
  if (error) {
    console.warn("[market] could not save suggested keywords:", error.message);
    return 0;
  }
  return keywords.length;
}

/** Active listening keywords for a user's company, used to steer social-signal prospecting. */
export async function activeListeningKeywords(db: SupabaseClient, userId: string): Promise<string[]> {
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return [];
  const { data } = await db.from("market_keywords").select("keyword").eq("company_id", company.id).eq("is_active", true).limit(12);
  return (data ?? []).map((row) => row.keyword as string);
}
