import { createGenAIClient, getAiModel } from "@/lib/ai/vertex";
import type { ProspectCriteria } from "./types";
import { safeAiErrorMessage } from "@/lib/ai/errors";

export interface DiscoveredCompany {
  name: string;
  domain: string;
  angle: string;
  angleType: "industry" | "persona" | "geography";
  evidenceUrl: string;
}

const EXCLUDED_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "wikipedia.org",
  "crunchbase.com",
  "youtube.com",
  "glassdoor.com",
  "indeed.com",
  "medium.com",
  "github.com",
  "g2.com",
  "capterra.com",
  "producthunt.com",
];

function normalizeDomain(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    const host = new URL(withScheme).hostname.replace(/^www\./, "");
    if (!host.includes(".")) return null;
    if (EXCLUDED_HOSTS.some((excluded) => host === excluded || host.endsWith(`.${excluded}`))) {
      return null;
    }
    return host;
  } catch {
    return null;
  }
}

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

interface Angle {
  text: string;
  type: DiscoveredCompany["angleType"];
}

/**
 * Builds distinct query angles so discovery isn't just one search — an
 * industry angle, a persona angle (who'd actually buy this), and a
 * geography angle, each run separately and merged/deduped. More angles run
 * only as needed to reach the target count.
 */
function buildAngles(criteria: ProspectCriteria): Angle[] {
  const industries = criteria.industries.length > 0 ? criteria.industries : ["B2B SaaS"];
  const geographies = criteria.geographies;
  const personas = criteria.personas ?? [];
  const sizeClause = criteria.companySizeRange ? `, roughly ${criteria.companySizeRange}` : "";
  const geoClause = geographies[0] ? ` based in ${geographies[0]}` : "";

  const angles: Angle[] = [];

  for (const industry of industries.slice(0, 3)) {
    angles.push({
      text: `companies in the "${industry}" industry${geoClause}${sizeClause}`,
      type: "industry",
    });
  }

  for (const persona of personas.slice(0, 2)) {
    angles.push({
      text: `companies that employ a "${persona}"${geoClause}, in industries like ${industries.join(", ")}`,
      type: "persona",
    });
  }

  if (geographies.length > 1) {
    angles.push({
      text: `companies in industries like ${industries.join(", ")}, based in ${geographies[1]}${sizeClause}`,
      type: "geography",
    });
  }

  return angles;
}

/**
 * The actual discovery engine: runs each angle as its own grounded-search
 * call against Gemini (real Google Search results, not model recall),
 * merging and deduping by domain as it goes, and stopping once `limit` is
 * reached rather than always running every angle.
 */
export async function discoverCompanies(
  criteria: ProspectCriteria,
  limit: number
): Promise<DiscoveredCompany[]> {
  const angles = buildAngles(criteria);
  const seen = new Map<string, DiscoveredCompany>();

  for (const angle of angles) {
    if (seen.size >= limit) break;
    const remaining = limit - seen.size;
    const askFor = Math.min(remaining + 5, 15);

    const prompt = `Using web search, find up to ${askFor} real, currently operating companies matching: ${angle.text}.

Exclude social media platforms, directories, review sites, marketplaces, and aggregator sites (LinkedIn, Crunchbase, G2, Capterra, Wikipedia, etc.) — only real companies with their own website.

Return ONLY a JSON array (no markdown fences, no commentary) of objects: [{ "name": string, "domain": string, "evidenceUrl": string }]. "domain" must be the company's own root domain and "evidenceUrl" must be a public search result supporting the match. If you can't find enough, return fewer — never invent companies.`;

    try {
      const ai = createGenAIClient();
      const response = await ai.models.generateContent({
        model: getAiModel(),
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          temperature: 0.4,
          maxOutputTokens: 2048,
          tools: [{ googleSearch: {} }],
          thinkingConfig: { thinkingBudget: 0 },
        },
      });

      const parsed = extractJsonArray(response.text ?? "[]");
      if (!Array.isArray(parsed)) continue;

      for (const item of parsed) {
        if (seen.size >= limit) break;
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const name = typeof o.name === "string" ? o.name.trim().slice(0, 120) : "";
        const domain = typeof o.domain === "string" ? normalizeDomain(o.domain) : null;
        const evidenceUrl = typeof o.evidenceUrl === "string" ? o.evidenceUrl.trim().slice(0, 1000) : "";
        let evidenceHost: string | null = null;
        try { evidenceHost = new URL(evidenceUrl).hostname.replace(/^www\./, ""); } catch { /* Invalid evidence is rejected. */ }
        if (!name || !domain || !evidenceHost || seen.has(domain)) continue;
        seen.set(domain, { name, domain, angle: angle.text, angleType: angle.type, evidenceUrl });
      }
    } catch (err) {
      console.error(`[prospecting] discovery angle failed (${angle.type}): ${safeAiErrorMessage(err)}`);
    }
  }

  return [...seen.values()];
}
