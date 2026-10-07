import { lookup } from "node:dns/promises";
import { getAiClient } from "@/lib/ai/openai";
import { safeAiErrorMessage } from "@/lib/ai/errors";

export interface CompetitorMatch {
  name: string;
  domain: string;
  /** One line on what they offer that is the same, from the search results. */
  reason: string;
}

const MAX_COMPETITORS = 10;
const GOOD_ENOUGH = 6;

function extractJsonArray(text: string): unknown {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Model did not return a valid JSON array");
  }
}

export function hostOf(raw: string): string {
  const value = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  return value.split("/")[0].split("?")[0].split("#")[0].split(":")[0];
}

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/** Search results sometimes return a profile or directory page instead of the company; those are not matches. */
const NOT_A_COMPANY = /(^|\.)(linkedin|g2|capterra|crunchbase|wikipedia|reddit|youtube|twitter|x|facebook|medium|github|producthunt|trustpilot|gartner|forbes|techcrunch)\./;

/** Pure: turn the model's raw rows into clean, de-duplicated candidates, dropping the company itself. */
export function cleanCandidates(raw: unknown, ownDomain: string): CompetitorMatch[] {
  if (!Array.isArray(raw)) return [];
  const own = hostOf(ownDomain);
  const seen = new Set<string>();
  const out: CompetitorMatch[] = [];
  for (const item of raw) {
    let name = "";
    let domain = "";
    let reason = "";
    if (typeof item === "string") {
      const host = hostOf(item);
      if (DOMAIN_RE.test(host)) domain = host;
      name = item.trim();
    } else if (item && typeof item === "object") {
      const row = item as Record<string, unknown>;
      name = typeof row.name === "string" ? row.name.trim() : "";
      domain = typeof row.domain === "string" ? hostOf(row.domain) : "";
      reason = typeof row.reason === "string" ? row.reason.trim().slice(0, 140) : "";
    }
    name = name.slice(0, 80);
    if (!name || !DOMAIN_RE.test(domain)) continue;
    if (own && (domain === own || own.endsWith(`.${domain}`) || domain.endsWith(`.${own}`))) continue;
    if (NOT_A_COMPANY.test(`${domain}.`)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push({ name, domain, reason });
  }
  return out;
}

async function resolves(domain: string): Promise<boolean> {
  try {
    await Promise.race([lookup(domain), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000))]);
    return true;
  } catch {
    return false;
  }
}

async function searchOnce(prompt: string): Promise<unknown> {
  const { ai, model } = await getAiClient();
  const response = await ai.responses.create({
    model,
    input: prompt,
    max_output_tokens: 2048,
    tools: [{ type: "web_search" }],
  });
  return extractJsonArray(response.output_text ?? "[]");
}

const FORMAT = `Return ONLY a JSON array (no markdown fences, no commentary) of up to 12 objects: {"name": "Company name", "domain": "officialsite.com", "reason": "one short line on what they offer that is the same"}. The domain must be the company's real website, not a review site, directory or news article. If you cannot find real companies, return [].`;

export interface OfferingProfile {
  /** The service or product, in the plain words a buyer would search for (no brand names). */
  offering: string;
  /** Who buys it. */
  customer: string;
  /** How it is sold: SaaS subscription, agency/services, marketplace, usage-based API, and so on. */
  model: string;
  /** Two or three search phrases for the category. */
  searches: string[];
}

function offeringFallback(params: { productSummary: string | null; industries: string[] }): OfferingProfile | null {
  const offering = (params.productSummary ?? "").trim().slice(0, 160);
  if (!offering) return null;
  return { offering, customer: params.industries.slice(0, 3).join(", ") || "businesses", model: "", searches: [offering] };
}

/**
 * Reads the business as an offering first: what is sold, to whom, and how.
 * The brand name is deliberately left out, so the search that follows looks
 * for other businesses selling the same thing rather than for "competitors of X".
 */
export async function describeOffering(params: {
  productSummary: string | null;
  positioning?: string | null;
  valueProp?: string | null;
  industries: string[];
  personas?: string[];
}): Promise<OfferingProfile | null> {
  const fallback = offeringFallback(params);
  try {
    const { ai, model } = await getAiClient();
    const response = await ai.responses.create({
      model,
      max_output_tokens: 600,
      input: `From this business description, work out what is being sold. Do NOT use the company's name anywhere in your answer.

What they do: ${params.productSummary ?? "unknown"}
Positioning: ${params.positioning ?? "unknown"}
Value: ${params.valueProp ?? "unknown"}
Industries they sell to: ${params.industries.join(", ") || "unknown"}
Buyer roles: ${(params.personas ?? []).join(", ") || "unknown"}

Return ONLY JSON: {"offering": "the service or product in plain words a buyer would search for, e.g. 'outbound lead generation software for B2B startups'", "customer": "who buys it", "model": "how it is sold, e.g. SaaS subscription, done-for-you agency, marketplace, usage-based API", "searches": ["2 to 3 short search phrases for this category, e.g. 'AI SDR software', 'B2B lead generation tools'"]}`,
    });
    const text = (response.output_text ?? "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Partial<OfferingProfile>;
    const offering = String(parsed.offering ?? "").trim();
    if (!offering) return fallback;
    const searches = Array.isArray(parsed.searches)
      ? parsed.searches.filter((q): q is string => typeof q === "string" && q.trim() !== "").slice(0, 3)
      : [];
    return {
      offering,
      customer: String(parsed.customer ?? "").trim() || "businesses",
      model: String(parsed.model ?? "").trim(),
      searches: searches.length ? searches : [offering],
    };
  } catch (err) {
    console.error(`[blueprint] offering profile failed: ${safeAiErrorMessage(err)}`);
    return fallback;
  }
}

/**
 * Finds other businesses that sell the same thing. It first works out the
 * offering, the customer and the business model, then searches the web for
 * companies in that category (not for the user's own name), and checks the
 * result: every match needs a real domain that resolves, the user's own
 * company is removed, and a thin first pass is topped up with a second search
 * framed on the category's own search phrases.
 */
export async function findCompetitors(params: {
  companyName: string | null;
  websiteUrl?: string | null;
  productSummary: string | null;
  positioning?: string | null;
  valueProp?: string | null;
  industries: string[];
  personas?: string[];
}): Promise<CompetitorMatch[]> {
  const { companyName, websiteUrl, productSummary, positioning, valueProp, industries, personas } = params;
  if (!companyName && !productSummary) return [];
  const ownDomain = websiteUrl ? hostOf(websiteUrl) : "";

  const profile = await describeOffering({ productSummary, positioning, valueProp, industries, personas });
  if (!profile) return [];

  const category = `Offering: ${profile.offering}
Sold to: ${profile.customer}${profile.model ? `\nBusiness model: ${profile.model}` : ""}`;

  const first = `Using web search, find real businesses that offer this same service or product to the same kind of customer, using the same kind of business model. Search for the category itself, not for any one company.

${category}

Include businesses of different sizes and stages, direct matches first, then close alternatives a buyer would also consider. Exclude huge general-purpose platforms that only partly overlap, and non-companies (review sites, directories, articles).${ownDomain ? ` Do not include ${ownDomain}.` : ""}

${FORMAT}`;

  const second = `Using web search, run these searches and list the real companies that sell this offering: ${profile.searches.map((q) => `"${q}"`).join(", ")}, plus "best ${profile.searches[0] ?? profile.offering} for ${profile.customer}".

${category}

${ownDomain ? `Do not include ${ownDomain}. ` : ""}${FORMAT}`;

  const collect = async (prompt: string, existing: CompetitorMatch[]): Promise<CompetitorMatch[]> => {
    try {
      const fresh = cleanCandidates(await searchOnce(prompt), ownDomain);
      const known = new Set(existing.map((c) => c.domain));
      const candidates = fresh.filter((c) => !known.has(c.domain));
      const checks = await Promise.all(candidates.map((c) => resolves(c.domain)));
      return [...existing, ...candidates.filter((_, i) => checks[i])];
    } catch (err) {
      console.error(`[blueprint] competitor search failed: ${safeAiErrorMessage(err)}`);
      return existing;
    }
  };

  let found = await collect(first, []);
  if (found.length < GOOD_ENOUGH) found = await collect(second, found);
  return found.slice(0, MAX_COMPETITORS);
}
