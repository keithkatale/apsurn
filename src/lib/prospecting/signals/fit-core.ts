/**
 * Pure helpers for the ICP-fit pass over job-board candidates, which arrive
 * with a company name and a role but no industry or size. No runtime imports
 * (fit.test.ts).
 */

export interface FitItem {
  idx: number;
  company: string;
  domain: string;
  role: string;
}

export function buildFitPrompt(items: FitItem[], icp: { industries: string[]; geographies: string[]; companySizeRange?: string; productSummary?: string | null }): string {
  const lines = items.map((item) => `${item.idx}. ${item.company} (${item.domain}) — hiring: ${item.role}`).join("\n");
  return `You are screening companies for a B2B sales team. Decide for each numbered company whether it plausibly belongs to the target customer profile. Use only what you actually know about the company from its name and domain; if you do not recognise it and the name gives no clear signal, answer false. Do not guess.

Target customer profile
- Industries: ${icp.industries.join(", ") || "(any)"}
- Regions: ${icp.geographies.join(", ") || "(any)"}
- Company size: ${icp.companySizeRange ?? "(any)"}
${icp.productSummary ? `- What the seller offers: ${icp.productSummary.slice(0, 400)}\n` : ""}
Companies
${lines}

Reply with ONLY JSON: {"verdicts":[{"i":<number>,"fit":<true|false>}]} covering every number.`;
}

/** Returns the set of idx values judged a fit, or null when the reply is unusable (callers fail open, loudly). */
export function parseFitVerdicts(text: string, expected: number[]): Set<number> | null {
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
  const verdicts = (parsed as { verdicts?: unknown } | null)?.verdicts;
  if (!Array.isArray(verdicts)) return null;

  const allowed = new Set(expected);
  const fits = new Set<number>();
  const answered = new Set<number>();
  for (const row of verdicts) {
    const entry = row && typeof row === "object" ? (row as { i?: unknown; fit?: unknown }) : null;
    const idx = Number(entry?.i);
    if (!entry || !allowed.has(idx)) continue;
    answered.add(idx);
    if (entry.fit === true) fits.add(idx);
  }
  // A reply that skipped most companies isn't a verdict.
  return answered.size >= Math.ceil(expected.length / 2) ? fits : null;
}

const WORLDWIDE = /\b(remote|worldwide|anywhere|global|hybrid)\b/i;

/** Does a posting's location text fit the ICP regions? Remote/worldwide roles pass; an unlocated posting passes (can't be ruled out). */
export function locationFits(location: string | null | undefined, regionTokens: string[]): boolean {
  if (regionTokens.length === 0) return true;
  const text = (location ?? "").trim();
  if (!text) return true;
  if (WORLDWIDE.test(text) && !/\b(europe|emea|eu only|uk only|apac|asia|latam)\b/i.test(text)) return true;
  const lower = text.toLowerCase();
  return regionTokens.some((token) => {
    const needle = token.toLowerCase().trim();
    if (!needle) return false;
    // Short tokens (state codes like "CA") must match as whole words, not inside "Canada" or "Chicago".
    return needle.length <= 3 ? new RegExp(`\\b${needle}\\b`, "i").test(text) : lower.includes(needle);
  });
}
