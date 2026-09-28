import type { ProspectCriteria } from "./types";

const DEFAULT_BASE = "https://leads.apsurn.com";

export interface YcLeadContact {
  fullName: string;
  title: string | null;
  linkedinUrl: string | null;
  email: string | null;
}

export interface YcLeadCompany {
  name: string;
  domain: string;
  website: string | null;
  industry: string | null;
  location: string | null;
  teamSize: number | null;
  contact: YcLeadContact | null;
}

interface YcApiContact {
  full_name?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  email_guess_unverified?: string | null;
}

interface YcApiCompany {
  name?: string | null;
  domain?: string | null;
  website?: string | null;
  industry?: string | null;
  location?: string | null;
  team_size?: number | null;
  contacts?: YcApiContact[] | null;
}

export function ycLeadsConfigured() {
  return Boolean(process.env.YC_LEADS_API_KEY?.trim());
}

const TERM_SKIP = new Set(["and", "the", "for", "with", "saas", "software", "services", "company", "companies", "platform"]);

function criteriaTerms(industries: string[]) {
  const phrases = industries.map((industry) => industry.trim()).filter(Boolean);
  const tokens = phrases.flatMap((phrase) =>
    phrase
      .split(/[^a-zA-Z0-9+]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 2 && !TERM_SKIP.has(token.toLowerCase())),
  );
  return [...new Set([...phrases, ...tokens])].slice(0, 8);
}

function baseUrl() {
  return (process.env.YC_LEADS_API_BASE?.trim() || DEFAULT_BASE).replace(/\/$/, "");
}

function pickContact(contacts: YcApiContact[] | null | undefined, personas: string[]): YcLeadContact | null {
  const named = (contacts ?? []).filter((contact) => contact.full_name?.trim());
  if (named.length === 0) return null;
  const needles = personas.map((persona) => persona.toLowerCase());
  const ranked = [...named].sort((a, b) => scoreContact(b, needles) - scoreContact(a, needles));
  const best = ranked[0];
  return {
    fullName: best.full_name!.trim(),
    title: best.title?.trim() || null,
    linkedinUrl: best.linkedin_url?.trim() || null,
    email: best.email_guess_unverified?.trim() || null,
  };
}

function scoreContact(contact: YcApiContact, personas: string[]) {
  const title = (contact.title ?? "").toLowerCase();
  let score = 0;
  if (personas.some((persona) => persona && title.includes(persona))) score += 4;
  if (/founder|chief executive|ceo/.test(title)) score += 3;
  if (contact.linkedin_url) score += 1;
  if (contact.email_guess_unverified) score += 1;
  return score;
}

async function queryCompanies(params: Record<string, string>): Promise<{ total: number; companies: YcApiCompany[] } | "skip" | "down"> {
  const key = process.env.YC_LEADS_API_KEY?.trim();
  if (!key) return "down";
  const url = new URL("/api/v1/companies", baseUrl());
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  } catch (error) {
    console.warn("[yc-leads] request failed", error instanceof Error ? error.message : error);
    return "down";
  }
  if (response.status === 400) return "skip";
  if (!response.ok) {
    console.warn(`[yc-leads] ${response.status} for ${url.pathname}${url.search}`);
    return "down";
  }
  const body = (await response.json()) as { data?: YcApiCompany[]; pagination?: { total?: number } };
  return { total: body.pagination?.total ?? body.data?.length ?? 0, companies: body.data ?? [] };
}

/**
 * Search the YC leads database with the ICP industries, first as an industry,
 * then as a tag, then as a name search. `matched` is false when none of those
 * criteria exist in the database, which is the signal to use Icypeas.
 */
export async function searchYcLeads(
  criteria: ProspectCriteria,
  limit: number,
): Promise<{ matched: boolean; companies: YcLeadCompany[] }> {
  if (!ycLeadsConfigured()) return { matched: false, companies: [] };
  const terms = criteriaTerms(criteria.industries);
  if (terms.length === 0) return { matched: false, companies: [] };

  const pageSize = String(Math.min(Math.max(limit, 1), 200));
  for (const mode of ["industry", "tag", "search"] as const) {
    const collected: YcApiCompany[] = [];
    let matched = false;
    for (const term of terms) {
      const result = await queryCompanies({
        [mode]: term,
        embed_contacts: "true",
        limit: pageSize,
        order: "name.asc",
      });
      if (result === "down") return { matched: false, companies: [] };
      if (result === "skip" || result.total === 0) continue;
      matched = true;
      collected.push(...result.companies);
    }
    if (!matched) continue;
    return { matched: true, companies: dedupe(collected, criteria.personas ?? [], limit) };
  }
  return { matched: false, companies: [] };
}

function dedupe(companies: YcApiCompany[], personas: string[], limit: number): YcLeadCompany[] {
  const seen = new Set<string>();
  const leads: YcLeadCompany[] = [];
  for (const company of companies) {
    const domain = company.domain?.trim().toLowerCase().replace(/^www\./, "");
    const name = company.name?.trim();
    if (!domain || !name || seen.has(domain)) continue;
    seen.add(domain);
    leads.push({
      name,
      domain,
      website: company.website?.trim() || null,
      industry: company.industry?.trim() || null,
      location: company.location?.trim() || null,
      teamSize: typeof company.team_size === "number" ? company.team_size : null,
      contact: pickContact(company.contacts, personas),
    });
    if (leads.length >= limit) break;
  }
  return leads;
}
