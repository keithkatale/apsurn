/**
 * The "listed" archetype: software and digital businesses that appear in
 * public directories by choice.
 *
 * YC's community-maintained OSS mirror is the anchor — ~6,200 companies with
 * website, batch, industry, team size, stage and a current `isHiring` flag,
 * as one keyless JSON document. Job aggregators add companies outside YC and
 * carry their own recency signal.
 */

import { fetchJsonOrThrow, normalizeDomain } from "./client";
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

/** Substring match, for free-text fields only (pitch copy). Never used on a closed vocabulary. */
function matchesKeyword(haystack: string, needles: string[]): boolean {
  if (needles.length === 0) return true;
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase().trim()));
}

/**
 * `all_locations` is a semicolon/comma separated list ("San Francisco, CA,
 * USA; Remote"), so geography must be matched by whole token.
 *
 * Substring matching here was a real bug in the opposite direction from the
 * vocabulary one: the needle "CA" matched Cambridge, Chicago and Canada,
 * over-reporting by 261 companies.
 */
function locationTokens(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/[;,]/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
  );
}

function hasAnyToken(tokens: Set<string>, needles: string[]): boolean {
  if (needles.length === 0) return true;
  return needles.some((needle) => tokens.has(needle.trim().toLowerCase()));
}

function hasAnyExact(values: Array<string | undefined>, needles: string[]): boolean {
  if (needles.length === 0) return false;
  const present = new Set(values.filter(Boolean).map((v) => (v as string).toLowerCase()));
  return needles.some((needle) => present.has(needle.trim().toLowerCase()));
}

/**
 * A precise YC filter.
 *
 * YC's taxonomy is a small closed set — 9 industries, 59 subindustries, 337
 * tags — so these are matched exactly rather than by substring. The previous
 * implementation concatenated all three into one string and substring-matched
 * the ICP's own wording against it, which meant a realistic ICP term like
 * "Sales Technology SaaS" or "Artificial Intelligence Software" matched
 * nothing at all, and the caller silently received zero companies.
 *
 * Tags are the most useful of the three, because that is where the words an
 * ICP actually uses live: SaaS (1101), Artificial Intelligence (1021),
 * Fintech (709), Developer Tools (553).
 *
 * `industries`, `subindustries` and `tags` are OR'd with each other; the
 * location and keyword filters are then AND'd on top.
 */
export interface YcFilter {
  industries?: string[];
  subindustries?: string[];
  tags?: string[];
  locationTokens?: string[];
  /** Substring, matched against the company's own pitch copy only. */
  keywords?: string[];
  hiringOnly?: boolean;
  minTeamSize?: number;
  maxTeamSize?: number;
  limit?: number;
}

async function loadYcCompanies(): Promise<YcCompany[]> {
  // Throws when the directory is unreachable. Returning [] here would be
  // reported upstream as "no companies match", which is a different and much
  // more misleading statement than "the source did not answer".
  const all = await fetchJsonOrThrow<YcCompany[]>("https://yc-oss.github.io/api/companies/all.json");
  return Array.isArray(all) ? all : [];
}

function toSourcedCompany(company: YcCompany): SourcedCompany {
  return {
    name: company.name ?? "",
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
    signalEvidence: company.isHiring
      ? `Listed as actively hiring in the YC directory${company.batch ? `, ${company.batch} batch` : ""}`
      : null,
    signalDate: null,
  };
}

function ycMatches(company: YcCompany, filter: YcFilter): boolean {
  if (!company.name || !company.website) return false;
  if (company.status && company.status.toLowerCase() === "inactive") return false;
  if (filter.hiringOnly && !company.isHiring) return false;

  const size = company.team_size ?? 0;
  if (filter.minTeamSize !== undefined && size < filter.minTeamSize) return false;
  if (filter.maxTeamSize !== undefined && size > 0 && size > filter.maxTeamSize) return false;

  // The three taxonomy predicates are alternatives, not requirements: an ICP
  // naming "SaaS" should match on the tag even though no YC industry is
  // called that. Only enforced when at least one was supplied.
  const taxonomyNeedles =
    (filter.industries?.length ?? 0) + (filter.subindustries?.length ?? 0) + (filter.tags?.length ?? 0);
  if (taxonomyNeedles > 0) {
    const taxonomyHit =
      hasAnyExact([company.industry], filter.industries ?? []) ||
      hasAnyExact([company.subindustry], filter.subindustries ?? []) ||
      hasAnyExact(company.tags ?? [], filter.tags ?? []);
    if (!taxonomyHit) return false;
  }

  if (!hasAnyToken(locationTokens(company.all_locations), filter.locationTokens ?? [])) return false;

  if ((filter.keywords?.length ?? 0) > 0) {
    const pitch = [company.one_liner, company.long_description].filter(Boolean).join(" ");
    if (!matchesKeyword(pitch, filter.keywords ?? [])) return false;
  }

  return true;
}

/** Y Combinator's company directory, filtered precisely. */
export async function ycCompanies(filter: YcFilter): Promise<SourcedCompany[]> {
  const all = await loadYcCompanies();
  const limit = Math.min(500, Math.max(1, filter.limit ?? 50));

  const out: SourcedCompany[] = [];
  for (const company of all) {
    if (!ycMatches(company, filter)) continue;
    out.push(toSourcedCompany(company));
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * How many companies a filter would return, without materialising them.
 *
 * The whole directory is one cached document, so counting is effectively
 * free — which is what makes the caller's widening ladder possible: it can
 * try a narrow filter, see it yields 3, and widen before spending anything.
 */
export async function ycCount(filter: YcFilter): Promise<number> {
  const all = await loadYcCompanies();
  let count = 0;
  for (const company of all) if (ycMatches(company, { ...filter, limit: undefined })) count += 1;
  return count;
}

/** The live vocabulary, so a caller can validate terms instead of guessing at them. */
export async function ycVocabulary(): Promise<{
  industries: string[];
  subindustries: string[];
  tags: Array<{ tag: string; count: number }>;
  locationTokens: string[];
}> {
  const all = await loadYcCompanies();
  const industries = new Set<string>();
  const subindustries = new Set<string>();
  const tagCounts = new Map<string, number>();
  const locations = new Set<string>();

  for (const company of all) {
    if (company.industry) industries.add(company.industry);
    if (company.subindustry) subindustries.add(company.subindustry);
    for (const tag of company.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    for (const token of locationTokens(company.all_locations)) locations.add(token);
  }

  return {
    industries: [...industries].sort(),
    subindustries: [...subindustries].sort(),
    tags: [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count),
    locationTokens: [...locations].sort(),
  };
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
  const data = await fetchJsonOrThrow<{ data?: ArbeitnowJob[] }>("https://www.arbeitnow.com/api/job-board-api");
  if (!data?.data?.length) return [];

  const keywords = (opts.keywords ?? []).filter(Boolean);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));

  const seen = new Set<string>();
  const out: SourcedCompany[] = [];
  for (const job of data.data) {
    const name = job.company_name?.trim();
    const title = job.title?.trim() ?? "";
    if (!name || seen.has(name.toLowerCase())) continue;
    if (keywords.length > 0 && !matchesKeyword(`${title} ${(job.tags ?? []).join(" ")}`, keywords)) continue;
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
  const data = await fetchJsonOrThrow<{ jobs?: RemotiveJob[] }>(`https://remotive.com/api/remote-jobs?limit=${limit * 3}`);
  if (!data?.jobs?.length) return [];

  const keywords = (opts.keywords ?? []).filter(Boolean);
  const seen = new Set<string>();
  const out: SourcedCompany[] = [];
  for (const job of data.jobs) {
    const name = job.company_name?.trim();
    const title = job.title?.trim() ?? "";
    if (!name || seen.has(name.toLowerCase())) continue;
    if (keywords.length > 0 && !matchesKeyword(`${title} ${job.category ?? ""}`, keywords)) continue;
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
