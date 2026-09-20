/**
 * The "listed" archetype: software and digital businesses that appear in
 * public directories by choice.
 *
 * YC's community-maintained OSS mirror is the anchor — ~6,200 companies with
 * website, batch, industry, team size, stage and a current `isHiring` flag,
 * as one keyless JSON document. Job aggregators add companies outside YC and
 * carry their own recency signal.
 */

import { fetchJson, normalizeDomain } from "./client";
import type { SourcedCompany } from "./types";

interface YcCompany {
  name?: string;
  website?: string;
  one_liner?: string;
  long_description?: string;
  all_locations?: string;
  team_size?: number;
  industry?: string;
  subindustry?: string;
  batch?: string;
  stage?: string;
  status?: string;
  isHiring?: boolean;
  url?: string;
  tags?: string[];
}

function employeeBand(size: number | undefined): string | null {
  if (!size || size <= 0) return null;
  if (size <= 10) return "1-10";
  if (size <= 50) return "11-50";
  if (size <= 200) return "51-200";
  if (size <= 1000) return "201-1000";
  return "1000+";
}

function matchesAny(haystack: string, needles: string[]): boolean {
  if (needles.length === 0) return true;
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase().trim()));
}

/**
 * Y Combinator's company directory.
 *
 * `hiringOnly` is the cheap intent filter — YC publishes a live hiring flag,
 * so it costs nothing and removes companies with no reason to be buying.
 */
export async function ycCompanies(opts: {
  industries?: string[];
  geographies?: string[];
  keywords?: string[];
  hiringOnly?: boolean;
  maxTeamSize?: number;
  minTeamSize?: number;
  limit?: number;
}): Promise<SourcedCompany[]> {
  const all = await fetchJson<YcCompany[]>("https://yc-oss.github.io/api/companies/all.json");
  if (!Array.isArray(all)) return [];

  const industries = (opts.industries ?? []).filter(Boolean);
  const geographies = (opts.geographies ?? []).filter(Boolean);
  const keywords = (opts.keywords ?? []).filter(Boolean);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));

  const out: SourcedCompany[] = [];
  for (const company of all) {
    if (!company.name || !company.website) continue;
    if (company.status && company.status.toLowerCase() === "inactive") continue;
    if (opts.hiringOnly && !company.isHiring) continue;

    const size = company.team_size ?? 0;
    if (opts.minTeamSize !== undefined && size < opts.minTeamSize) continue;
    if (opts.maxTeamSize !== undefined && size > 0 && size > opts.maxTeamSize) continue;

    const industryText = [company.industry, company.subindustry, ...(company.tags ?? [])].filter(Boolean).join(" ");
    if (!matchesAny(industryText, industries)) continue;
    if (!matchesAny(company.all_locations ?? "", geographies)) continue;

    const pitch = [company.one_liner, company.long_description].filter(Boolean).join(" ");
    if (keywords.length > 0 && !matchesAny(`${industryText} ${pitch}`, keywords)) continue;

    out.push({
      name: company.name,
      domain: normalizeDomain(company.website),
      description: company.one_liner ?? null,
      location: company.all_locations ?? null,
      employeeBand: employeeBand(company.team_size),
      phone: null,
      contactName: null,
      contactTitle: null,
      source: `Y Combinator${company.batch ? ` (${company.batch})` : ""}`,
      sourceUrl: company.url ?? null,
      signal: company.isHiring ? "Actively hiring" : null,
      signalEvidence: company.isHiring ? `Listed as actively hiring in the YC directory${company.batch ? `, ${company.batch} batch` : ""}` : null,
      signalDate: null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

interface ArbeitnowJob {
  company_name?: string;
  title?: string;
  location?: string;
  url?: string;
  created_at?: number;
  tags?: string[];
  remote?: boolean;
}

/**
 * Arbeitnow's open job board API — EU/DACH-heavy, which matters because
 * German, Austrian and Swiss sites are legally required to publish a contact
 * email on their Impressum page, making them unusually easy to resolve later.
 */
export async function arbeitnowCompanies(opts: { keywords?: string[]; limit?: number }): Promise<SourcedCompany[]> {
  const data = await fetchJson<{ data?: ArbeitnowJob[] }>("https://www.arbeitnow.com/api/job-board-api");
  if (!data?.data?.length) return [];

  const keywords = (opts.keywords ?? []).filter(Boolean);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));

  const seen = new Set<string>();
  const out: SourcedCompany[] = [];
  for (const job of data.data) {
    const name = job.company_name?.trim();
    const title = job.title?.trim() ?? "";
    if (!name || seen.has(name.toLowerCase())) continue;
    if (keywords.length > 0 && !matchesAny(`${title} ${(job.tags ?? []).join(" ")}`, keywords)) continue;
    seen.add(name.toLowerCase());

    const postedAt = job.created_at ? new Date(job.created_at * 1000).toISOString() : null;
    out.push({
      name,
      domain: null,
      description: (job.tags ?? []).slice(0, 4).join(", ") || null,
      location: job.location ?? null,
      employeeBand: null,
      phone: null,
      contactName: null,
      contactTitle: null,
      source: "Arbeitnow job board",
      sourceUrl: job.url ?? null,
      signal: "Open role",
      signalEvidence: title ? `Hiring: "${title}"` : null,
      signalDate: postedAt,
    });
    if (out.length >= limit) break;
  }
  return out;
}

interface RemotiveJob {
  company_name?: string;
  title?: string;
  candidate_required_location?: string;
  url?: string;
  publication_date?: string;
  category?: string;
}

/** Remotive's open API — remote-first companies, which skew software and are usually contactable. */
export async function remotiveCompanies(opts: { keywords?: string[]; limit?: number }): Promise<SourcedCompany[]> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const data = await fetchJson<{ jobs?: RemotiveJob[] }>(`https://remotive.com/api/remote-jobs?limit=${limit * 3}`);
  if (!data?.jobs?.length) return [];

  const keywords = (opts.keywords ?? []).filter(Boolean);
  const seen = new Set<string>();
  const out: SourcedCompany[] = [];
  for (const job of data.jobs) {
    const name = job.company_name?.trim();
    const title = job.title?.trim() ?? "";
    if (!name || seen.has(name.toLowerCase())) continue;
    if (keywords.length > 0 && !matchesAny(`${title} ${job.category ?? ""}`, keywords)) continue;
    seen.add(name.toLowerCase());

    out.push({
      name,
      domain: null,
      description: job.category ?? null,
      location: job.candidate_required_location ?? null,
      employeeBand: null,
      phone: null,
      contactName: null,
      contactTitle: null,
      source: "Remotive",
      sourceUrl: job.url ?? null,
      signal: "Open role",
      signalEvidence: title ? `Hiring: "${title}"` : null,
      signalDate: job.publication_date ?? null,
    });
    if (out.length >= limit) break;
  }
  return out;
}
