/**
 * Icypeas: the paid lead-data provider.
 *
 * Two capabilities, and the first matters more than the second:
 *
 *   findPeopleAtCompany — who works at a domain, by job title. This is the
 *   step that was missing. Discovering people previously meant fetching a
 *   company's site and asking a model to read names off it, which fails on
 *   most sites: they render the team client-side, hide it behind a bot wall,
 *   or simply never publish one. The run log was full of "Found 0 people".
 *
 *   findEmail — a known name at a domain to an address.
 *
 * Both replace work the app was doing badly by scraping. The provider has
 * already crawled and cross-referenced sources we cannot reach, so it answers
 * in one call, and its answers are observations rather than hypotheses.
 *
 * Icypeas is the configured provider: cheapest real entry point ($19/month
 * for 1,000 credits), credits are only consumed on a successful find so
 * misses are free, and unused credits roll over without expiry — which suits
 * unpredictable volume. It reports the lowest false-positive rate of the
 * single-source tools, which is what protects an unwarmed sending domain.
 *
 * Entirely optional: with no API key configured every function here returns
 * null and callers fall through to the existing pattern logic, so the app
 * works exactly as before until a key is set.
 */

import type { ContactStatus } from "./types";

const BASE_URL = "https://app.icypeas.com/api";
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Geography wording to the country names Icypeas' `currentCompany.location`
 * filter expects. Verified live: "United States" matched 107,895 profiles
 * against "USA" only 20,224 and "North America" only 1,965 — the field
 * matches literal country names, not abbreviations, and region names like
 * "North America" are not expanded automatically. This map does the
 * expansion so an ICP can still say "North America" and mean it.
 */
const ICYPEAS_GEO: Record<string, string[]> = {
  "north america": ["United States", "Canada", "Mexico"],
  "united states": ["United States"],
  usa: ["United States"],
  us: ["United States"],
  america: ["United States"],
  canada: ["Canada"],
  uk: ["United Kingdom"],
  "united kingdom": ["United Kingdom"],
  britain: ["United Kingdom"],
  europe: ["United Kingdom", "Germany", "France", "Spain", "Netherlands", "Ireland", "Sweden"],
  "western europe": ["United Kingdom", "Germany", "France", "Spain", "Netherlands", "Ireland"],
  dach: ["Germany", "Austria", "Switzerland"],
  germany: ["Germany"],
  apac: ["Singapore", "Australia", "India", "Japan"],
  india: ["India"],
  australia: ["Australia"],
};

/** Turns ICP geography wording into Icypeas location tokens, passing unmapped values through as-is. */
export function translateIcypeasGeography(geographies: string[]): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const geography of geographies) {
    const normalized = geography.toLowerCase().trim();
    if (!normalized) continue;
    const mapped = ICYPEAS_GEO[normalized];
    for (const token of mapped ?? [geography.trim()]) {
      if (!seen.has(token.toLowerCase())) {
        seen.add(token.toLowerCase());
        tokens.push(token);
      }
    }
  }
  return tokens;
}

/**
 * Discovery is asynchronous: the search is queued, then polled.
 *
 * The two outcomes have very different shapes. A hit usually lands in the
 * first few seconds (measured: 3.8s and 8.3s against live lookups), so early
 * polls are frequent and then back off. A miss only reveals itself by never
 * completing, so it is bounded by wall clock rather than by an attempt count
 * — counting attempts ignored the round-trip time and let a miss run to 18s
 * of a four-minute budget.
 */
const POLL_BACKOFF_MS = [600, 700, 900, 1_100, 1_300, 1_500, 1_800, 2_000];
const MAX_POLL_WALLCLOCK_MS = 12_000;

export interface FoundEmail {
  email: string;
  /** Mapped from the provider's own confidence wording. */
  status: ContactStatus;
  provider: string;
  certainty: string | null;
}

export function isEmailFinderConfigured(): boolean {
  return Boolean(process.env.ICYPEAS_API_KEY?.trim());
}

export interface FoundPerson {
  fullName: string;
  firstName: string;
  lastName: string;
  title: string | null;
  companyName: string | null;
  location: string | null;
  profileUrl: string | null;
  headline: string | null;
}

interface FindPeopleResponse {
  success?: boolean;
  total?: number;
  leads?: Array<{
    firstname?: string;
    lastname?: string;
    headline?: string;
    profileUrl?: string;
    lastJobTitle?: string;
    lastCompanyName?: string;
    address?: string;
  }>;
}

/**
 * Who works at a domain, optionally narrowed to particular job titles.
 *
 * Synchronous, unlike the email search — one request, results inline. The
 * records carry a name, title and profile URL but no email; resolving that is
 * a separate step per person, which is the right shape anyway since only
 * people who pass qualification are worth spending an email credit on.
 *
 * Returns an empty array when the provider knows nobody there, and null when
 * the lookup itself could not be performed (unconfigured, refused, failed).
 * Callers need that distinction to report "nobody found" separately from
 * "lookup unavailable" — collapsing the two is what let failures pass
 * silently as empty results.
 */
export async function findPeopleAtCompany(
  domain: string,
  titles: string[] = [],
  limit = 10
): Promise<FoundPerson[] | null> {
  const apiKey = process.env.ICYPEAS_API_KEY?.trim();
  if (!apiKey || !domain) return null;

  const query: Record<string, unknown> = {
    currentCompanyWebsite: { include: [domain] },
  };
  // Titles are matched as open text, so short generic fragments ("sales")
  // pull in adjacent roles too, which is what we want for persona matching.
  const cleanTitles = titles.map((t) => t.trim()).filter(Boolean).slice(0, 200);
  if (cleanTitles.length > 0) query.currentJobTitle = { include: cleanTitles };

  const response = await post<FindPeopleResponse>(
    "/find-people",
    { query, pagination: { size: Math.min(200, Math.max(1, limit)) } },
    apiKey
  );
  if (!response?.success) {
    console.warn(`[icypeas] find-people lookup failed for ${domain}`);
    return null;
  }

  return (response.leads ?? []).flatMap((lead): FoundPerson[] => {
    const firstName = (lead.firstname ?? "").trim();
    const lastName = (lead.lastname ?? "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    if (!fullName) return [];
    return [
      {
        fullName,
        firstName,
        lastName,
        title: lead.lastJobTitle?.trim() || null,
        companyName: lead.lastCompanyName?.trim() || null,
        location: lead.address?.trim() || null,
        profileUrl: lead.profileUrl?.trim() || null,
        headline: lead.headline?.trim() || null,
      },
    ];
  });
}

export interface CompanyLead {
  /** The person themselves — this IS a decision maker, not a candidate to be qualified against a page. */
  person: FoundPerson;
  companyName: string;
  companyWebsite: string | null;
  companyLocation: string | null;
  companySize: number | null;
  companyIndustry: string | null;
}

interface CompanySearchLead {
  firstname?: string;
  lastname?: string;
  headline?: string;
  profileUrl?: string;
  lastJobTitle?: string;
  lastCompanyName?: string;
  lastCompanyWebsite?: string;
  lastCompanyAddress?: string;
  lastCompanySize?: number;
  lastCompanyIndustry?: string;
  address?: string;
}

/**
 * Finds companies matching the ICP AND the person at each one who fits the
 * target personas — one call, since Icypeas' find-people endpoint already
 * filters by company industry/size/location alongside job title. Every
 * result is a real observation: a specific person, at a specific company,
 * already matching the title filter. There is nothing left to "extract".
 *
 * This is the intended replacement for find_companies + find_people/
 * extract_people run separately: those two steps existed because the app's
 * other sources (YC, registries) only ever named companies, leaving people
 * discovery as a second, much less reliable step done by scraping. Icypeas
 * does not have that gap.
 *
 * `industries` should already be Icypeas' own vocabulary — pass ICP text
 * through matchIcypeasIndustries first, not raw wording, or the filter will
 * silently match nobody (verified: "SaaS" and "Computer Software" are not
 * real values here and return zero).
 */
export async function findCompanyLeads(opts: {
  industries: string[];
  geographies: string[];
  titles: string[];
  minHeadcount?: number;
  maxHeadcount?: number;
  limit?: number;
}): Promise<CompanyLead[] | null> {
  const apiKey = process.env.ICYPEAS_API_KEY?.trim();
  if (!apiKey) return null;

  const query: Record<string, unknown> = {};
  if (opts.industries.length > 0) query["currentCompany.industry"] = { include: opts.industries.slice(0, 200) };
  if (opts.geographies.length > 0) query["currentCompany.location"] = { include: opts.geographies.slice(0, 200) };
  if (opts.titles.length > 0) query.currentJobTitle = { include: opts.titles.slice(0, 200) };
  if (opts.minHeadcount !== undefined || opts.maxHeadcount !== undefined) {
    const headcount: Record<string, number> = {};
    if (opts.minHeadcount !== undefined) headcount[">="] = Math.max(0, Math.floor(opts.minHeadcount));
    if (opts.maxHeadcount !== undefined) headcount["<="] = Math.max(0, Math.floor(opts.maxHeadcount));
    query["currentCompany.headcount"] = headcount;
  }
  // An unconstrained query (no filters at all) would return an arbitrary
  // slice of Icypeas' entire database — always require at least a title.
  if (Object.keys(query).length === 0) return [];

  const limit = Math.min(200, Math.max(1, opts.limit ?? 25));
  const response = await post<{ success?: boolean; leads?: CompanySearchLead[] }>(
    "/find-people",
    { query, pagination: { size: limit } },
    apiKey
  );
  if (!response?.success) {
    console.warn("[icypeas] find-company-leads query failed", JSON.stringify(query).slice(0, 300));
    return null;
  }

  const seenCompanies = new Set<string>();
  return (response.leads ?? []).flatMap((lead): CompanyLead[] => {
    const firstName = (lead.firstname ?? "").trim();
    const lastName = (lead.lastname ?? "").trim();
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const companyName = (lead.lastCompanyName ?? "").trim();
    if (!fullName || !companyName) return [];

    // One decision maker per company per run — the target is companies to
    // reach, not every matching person at the same one.
    const dedupeKey = (lead.lastCompanyWebsite || companyName).toLowerCase();
    if (seenCompanies.has(dedupeKey)) return [];
    seenCompanies.add(dedupeKey);

    return [
      {
        person: {
          fullName,
          firstName,
          lastName,
          title: lead.lastJobTitle?.trim() || null,
          companyName,
          location: lead.address?.trim() || null,
          profileUrl: lead.profileUrl?.trim() || null,
          headline: lead.headline?.trim() || null,
        },
        companyName,
        companyWebsite: lead.lastCompanyWebsite?.trim() || null,
        companyLocation: lead.lastCompanyAddress?.trim() || null,
        companySize: typeof lead.lastCompanySize === "number" ? lead.lastCompanySize : null,
        companyIndustry: lead.lastCompanyIndustry?.trim() || null,
      },
    ];
  });
}

export interface FoundCompany {
  name: string;
  website: string | null;
  location: string | null;
  size: number | null;
  industry: string | null;
}

/**
 * Step 1 of the two-step deterministic pipeline: which companies match the
 * ICP, with no assumption yet about who works there. Deliberately does not
 * filter by job title — that is Step 2's job (findPeopleAtCompany, scoped to
 * one specific company at a time), so a company is not excluded here just
 * because Icypeas' index happens to have no title-matched employee for it.
 *
 * Under the hood this still queries find-people (the only company-level
 * search Icypeas exposes), then keeps only the company fields off each row
 * and discards the person — whoever they are is incidental, not a match.
 */
export async function findCompaniesByIcp(opts: {
  industries: string[];
  geographies: string[];
  minHeadcount?: number;
  maxHeadcount?: number;
  limit?: number;
}): Promise<FoundCompany[]> {
  const apiKey = process.env.ICYPEAS_API_KEY?.trim();
  if (!apiKey) throw new IcypeasError("ICYPEAS_API_KEY is not set", null);

  const query: Record<string, unknown> = {};
  if (opts.industries.length > 0) query["currentCompany.industry"] = { include: opts.industries.slice(0, 200) };
  if (opts.geographies.length > 0) query["currentCompany.location"] = { include: opts.geographies.slice(0, 200) };
  if (opts.minHeadcount !== undefined || opts.maxHeadcount !== undefined) {
    const headcount: Record<string, number> = {};
    if (opts.minHeadcount !== undefined) headcount[">="] = Math.max(0, Math.floor(opts.minHeadcount));
    if (opts.maxHeadcount !== undefined) headcount["<="] = Math.max(0, Math.floor(opts.maxHeadcount));
    query["currentCompany.headcount"] = headcount;
  }
  // An unconstrained query would return an arbitrary slice of the entire
  // database rather than anything resembling "matches this ICP".
  if (Object.keys(query).length === 0) return [];

  // Oversampled relative to the requested limit: many rows will share a
  // company (multiple employees indexed at the same place), so the raw page
  // needs to be larger than the number of distinct companies wanted.
  const limit = Math.min(200, Math.max(1, opts.limit ?? 25));
  // Throws with the real reason (a timeout, an HTTP status, an API-reported
  // validation error) rather than swallowing it into a bare null — a run
  // that could not search at all is a different failure than one that
  // searched and matched nobody, and reporting them the same way is what
  // made a transient timeout here read as a rejected, unfixable query.
  const response = await postOrThrow<{ success?: boolean; leads?: CompanySearchLead[] }>(
    "/find-people",
    { query, pagination: { size: Math.min(200, limit * 5) } },
    apiKey
  );

  const seen = new Set<string>();
  const out: FoundCompany[] = [];
  for (const lead of response.leads ?? []) {
    const name = (lead.lastCompanyName ?? "").trim();
    if (!name) continue;
    const website = lead.lastCompanyWebsite?.trim() || null;
    const dedupeKey = (website || name).toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({
      name,
      website,
      location: lead.lastCompanyAddress?.trim() || null,
      size: typeof lead.lastCompanySize === "number" ? lead.lastCompanySize : null,
      industry: lead.lastCompanyIndustry?.trim() || null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * How many people the provider knows at a domain, matching the titles.
 *
 * Free — Icypeas does not charge for the count endpoint — so it is a cheap
 * way to skip companies the provider has no data on before spending anything.
 */
export async function countPeopleAtCompany(domain: string, titles: string[] = []): Promise<number | null> {
  const apiKey = process.env.ICYPEAS_API_KEY?.trim();
  if (!apiKey || !domain) return null;

  const query: Record<string, unknown> = { currentCompanyWebsite: { include: [domain] } };
  const cleanTitles = titles.map((t) => t.trim()).filter(Boolean).slice(0, 200);
  if (cleanTitles.length > 0) query.currentJobTitle = { include: cleanTitles };

  const response = await post<{ success?: boolean; total?: number }>("/find-people/count", { query }, apiKey);
  if (!response?.success) return null;
  return typeof response.total === "number" ? response.total : null;
}

/**
 * Icypeas grades each address it returns. Only the confident grades are
 * treated as send-ready; anything weaker is handed back as `risky` so the
 * existing verifier decides, rather than being trusted on the provider's word.
 */
function mapCertainty(certainty: string | null): ContactStatus {
  switch ((certainty ?? "").toLowerCase()) {
    case "ultra_sure":
    case "sure":
      return "verified";
    case "very_probable":
    case "probable":
      return "accept_all";
    default:
      return "risky";
  }
}

interface SearchResponse {
  success?: boolean;
  item?: { _id?: string; status?: string };
}

interface PollResponse {
  items?: Array<{
    status?: string;
    results?: { emails?: Array<{ email?: string; certainty?: string }> };
  }>;
}

/** Thrown by postOrThrow; carries the real reason a request failed instead of a bare null. */
export class IcypeasError extends Error {
  constructor(
    message: string,
    readonly status: number | null
  ) {
    super(message);
    this.name = "IcypeasError";
  }
}

interface PostAttempt<T> {
  ok: boolean;
  value: T | null;
  status: number | null;
  reason: string;
}

async function attempt<T>(path: string, body: unknown, apiKey: string): Promise<PostAttempt<T>> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // The body is where Icypeas puts the actual reason (e.g. a validation
      // error naming the offending field) — worth capturing even on failure,
      // since "the search rejected" without it is not actionable.
      const text = await response.text().catch(() => "");
      return { ok: false, value: null, status: response.status, reason: text.slice(0, 300) || `HTTP ${response.status}` };
    }
    const json = (await response.json()) as T & { success?: boolean; error?: string };
    if (json && typeof json === "object" && json.success === false) {
      return { ok: false, value: null, status: response.status, reason: json.error ?? "success:false with no error detail" };
    }
    return { ok: true, value: json as T, status: response.status, reason: "" };
  } catch (error) {
    // AbortSignal.timeout() throws a DOMException named "TimeoutError"; a
    // network failure throws TypeError. Neither carries an HTTP status.
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : "request failed";
    return { ok: false, value: null, status: null, reason };
  }
}

/**
 * POSTs to Icypeas, retrying once on any failure — including a timeout,
 * which is the failure this exists for: the API was proven to answer this
 * exact shape of request in under 6 seconds even at the largest page size,
 * so a single slow/dropped request is far more likely than a genuinely bad
 * query, and one retry is cheap insurance against it.
 *
 * Returns null on total failure, exactly as before, so callers that already
 * treat any failure as an ordinary miss (findEmail's polling, per-domain
 * people lookups) are unaffected. Use postOrThrow instead where the caller
 * needs to tell "the request failed" apart from "genuinely found nothing".
 */
async function post<T>(path: string, body: unknown, apiKey: string): Promise<T | null> {
  const first = await attempt<T>(path, body, apiKey);
  if (first.ok) return first.value;

  const retry = await attempt<T>(path, body, apiKey);
  if (retry.ok) return retry.value;

  console.warn(`[icypeas] ${path} failed twice: ${retry.reason}`);
  return null;
}

/** Like post, but throws IcypeasError (with the real reason) on total failure instead of returning null. */
async function postOrThrow<T>(path: string, body: unknown, apiKey: string): Promise<T> {
  const first = await attempt<T>(path, body, apiKey);
  if (first.ok) return first.value as T;

  const retry = await attempt<T>(path, body, apiKey);
  if (retry.ok) return retry.value as T;

  throw new IcypeasError(`${path} failed: ${retry.reason}`, retry.status);
}

function splitName(fullName: string): { firstname: string; lastname: string } | null {
  const parts = fullName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  return { firstname: parts[0], lastname: parts[parts.length - 1] };
}

const TERMINAL_STATUSES = new Set(["DEBITED", "FREE", "NONE_FOUND", "FAILED", "ABORTED"]);

/**
 * Finds a work email for a person at a domain.
 *
 * Returns null for every failure mode — unconfigured, rate-limited, timed
 * out, or genuinely not found — because the caller's job is to fall back to
 * pattern guessing, not to distinguish between those. Failures are logged,
 * never thrown: one provider hiccup must not abort a prospecting run.
 */
export async function findEmail(fullName: string, domain: string): Promise<FoundEmail | null> {
  const apiKey = process.env.ICYPEAS_API_KEY?.trim();
  if (!apiKey) return null;

  const name = splitName(fullName);
  if (!name || !domain) return null;

  const started = await post<SearchResponse>(
    "/email-search",
    { firstname: name.firstname, lastname: name.lastname, domainOrCompany: domain },
    apiKey
  );
  const searchId = started?.item?._id;
  if (!searchId) {
    console.warn(`[email-finder] search could not be queued for ${name.lastname} @ ${domain}`);
    return null;
  }

  const pollingDeadline = Date.now() + MAX_POLL_WALLCLOCK_MS;
  for (let attempt = 0; Date.now() < pollingDeadline; attempt++) {
    const delay = POLL_BACKOFF_MS[Math.min(attempt, POLL_BACKOFF_MS.length - 1)];
    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, pollingDeadline - Date.now())));
    if (Date.now() >= pollingDeadline) break;

    const polled = await post<PollResponse>("/bulk-single-searchs/read", { id: searchId }, apiKey);
    const item = polled?.items?.[0];
    if (!item) continue;

    const status = (item.status ?? "").toUpperCase();
    if (!TERMINAL_STATUSES.has(status)) continue;

    const best = item.results?.emails?.find((entry) => entry.email);
    if (!best?.email) return null; // Finished, found nothing — no credit spent.

    return {
      email: best.email.toLowerCase(),
      status: mapCertainty(best.certainty ?? null),
      provider: "icypeas",
      certainty: best.certainty ?? null,
    };
  }

  // Still running past the poll budget. The credit is only spent on a find, so
  // abandoning here costs nothing; the caller falls back to pattern guessing.
  return null;
}
