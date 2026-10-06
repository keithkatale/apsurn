/**
 * Hiring signal: a company with open roles for the function our product
 * serves is building that function now. Two paths, run together:
 *
 *  - ATS boards: seeds from the ICP (Icypeas), then each seed's public job
 *    board (Greenhouse, Ashby, Lever, Workable). Precise, but only mid-size
 *    companies with a public board show up.
 *  - Job boards: start from fresh postings (Arbeitnow, Remotive) and resolve
 *    each company's own domain. Wider reach, with the posting URL + date as
 *    the evidence.
 *
 * Either way the evidence is a real posting with a real date.
 */
import { normalizeDomain } from "../agent/shared";
import { parseHeadcountRange } from "../headcount";
import { findCompaniesByIcp, translateIcypeasGeography, type FoundCompany } from "../icypeas";
import { translateGeoTokens } from "../sources/vocabulary";
import { matchIcypeasIndustries } from "../icypeas-industries";
import { findAtsBoard, matchRoles } from "../sources/ats";
import { arbeitnowCompanies, remotiveCompanies } from "../sources/startups";
import { roleKeywordsFor } from "../sources/vocabulary";
import type { ProspectCriteria, TriggerSpec } from "../types";
import { resolveCompanyDomain } from "./domain";
import { filterByIcpFit } from "./fit";
import { locationFits } from "./fit-core";
import { hiringCandidateFromRoles } from "./hiring-core";
import type { SignalCandidate } from "./types";

const CONCURRENCY = 6;
const SEED_PAGE_SIZE = 100;
// Public ATS boards (Greenhouse, Ashby, Lever, Workable) are a mid-size company habit; below this almost none have one, and the probes are wasted.
const DEFAULT_MIN_HEADCOUNT = 20;
const MAX_SEED_PAGES = 3;

async function mapPool<T, R>(items: T[], limit: number, shouldStop: () => boolean, worker: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        if (shouldStop()) return;
        const index = cursor++;
        if (index >= items.length) return;
        out.push(await worker(items[index]));
      }
    }),
  );
  return out;
}

/** Companies matching the ICP that we haven't already saved — the pool whose job boards get checked. */
export async function seedCompanies(criteria: ProspectCriteria, known: Set<string>, want: number): Promise<Array<FoundCompany & { domain: string }>> {
  const industries = matchIcypeasIndustries(criteria.industries);
  const geographies = translateIcypeasGeography(criteria.geographies);
  const range = parseHeadcountRange(criteria.companySizeRange);
  const minHeadcount = range.min ?? (range.max === undefined ? DEFAULT_MIN_HEADCOUNT : undefined);
  const out: Array<FoundCompany & { domain: string }> = [];
  const seen = new Set<string>();
  let token: string | null = null;

  for (let page = 0; page < MAX_SEED_PAGES && out.length < want; page++) {
    const result: { companies: FoundCompany[]; nextToken: string | null } = await findCompaniesByIcp({
      industries,
      geographies,
      minHeadcount,
      maxHeadcount: range.max,
      pageSize: SEED_PAGE_SIZE,
      paginationToken: token,
    });
    for (const company of result.companies) {
      const domain = company.website ? normalizeDomain(company.website) : null;
      if (!domain || known.has(domain) || seen.has(domain)) continue;
      seen.add(domain);
      out.push({ ...company, domain });
    }
    token = result.nextToken;
    if (!token) break;
  }
  return out;
}

const DOMAIN_LOOKUP_CONCURRENCY = 4;
const DAY_MS = 86_400_000;

/** Fresh postings for the target roles from public job boards, each company resolved to its own domain. */
export async function collectJobBoardSignals(opts: {
  criteria: ProspectCriteria;
  productSummary?: string | null;
  keywords: string[];
  recencyDays: number;
  known: Set<string>;
  want: number;
  shouldStop: () => boolean;
}): Promise<SignalCandidate[]> {
  const { criteria, keywords, recencyDays, known, want, shouldStop } = opts;
  const regionTokens = [...criteria.geographies, ...translateGeoTokens(criteria.geographies)];
  const boards = await Promise.allSettled([
    arbeitnowCompanies({ keywords, limit: want }),
    remotiveCompanies({ keywords, limit: want }),
  ]);
  const postings = boards.flatMap((board) => (board.status === "fulfilled" ? board.value : []));

  const now = Date.now();
  const fresh = postings
    .filter((posting) => {
      const posted = posting.signalDate ? Date.parse(posting.signalDate) : NaN;
      return Number.isFinite(posted) && (now - posted) / DAY_MS <= recencyDays && locationFits(posting.location, regionTokens);
    })
    .sort((a, b) => Date.parse(b.signalDate ?? "") - Date.parse(a.signalDate ?? ""))
    .slice(0, want);

  const resolved = await mapPool(fresh, DOMAIN_LOOKUP_CONCURRENCY, shouldStop, async (posting) => {
    const domain = await resolveCompanyDomain(posting.name);
    if (!domain || known.has(domain)) return null;
    const age = Math.max(0, Math.round((now - Date.parse(posting.signalDate ?? "")) / DAY_MS));
    const title = posting.signalEvidence?.replace(/^Hiring:\s*/, "").replace(/^"|"$/g, "") ?? "a role";
    return {
      companyName: posting.name,
      domain,
      triggerType: "hiring" as const,
      headline: `Hiring a ${title} (posted ${age}d ago)`,
      sourceUrl: posting.sourceUrl,
      excerpt: title,
      eventDate: posting.signalDate,
      strength: 0.6,
      industry: null,
      location: posting.location,
      companySize: null,
    } satisfies SignalCandidate;
  });
  // Two postings can resolve to one domain (or one name to two): keep the first per domain, then check ICP fit.
  const byDomain = new Map<string, SignalCandidate>();
  for (const candidate of resolved) {
    if (candidate && candidate.domain && !byDomain.has(candidate.domain)) byDomain.set(candidate.domain, candidate);
  }
  return filterByIcpFit([...byDomain.values()], criteria, opts.productSummary);
}

export async function collectHiringSignals(opts: {
  criteria: ProspectCriteria;
  spec: TriggerSpec;
  known: Set<string>;
  /** Companies to check; bounded because each is up to a dozen network probes. */
  want: number;
  shouldStop: () => boolean;
  productSummary?: string | null;
}): Promise<SignalCandidate[]> {
  const { criteria, spec, known, want, shouldStop } = opts;
  const keywords = spec.roles?.length ? spec.roles : roleKeywordsFor(criteria.personas ?? []);

  const viaAts = async () => {
    const seeds = await seedCompanies(criteria, known, want);
    const found = await mapPool(seeds, CONCURRENCY, shouldStop, async (seed) => {
      const board = await findAtsBoard(seed.domain, { companyName: seed.name });
      if (!board) return null;
      return hiringCandidateFromRoles(matchRoles(board, keywords), board.companyName, seed.domain, spec.recencyDays, {
        name: seed.name,
        industry: seed.industry,
        location: seed.location,
        size: seed.size,
      });
    });
    return found.filter((candidate): candidate is SignalCandidate => Boolean(candidate));
  };

  // One path failing (Icypeas down, a board API timing out) must not lose the other path's results.
  const [ats, boards] = await Promise.allSettled([
    viaAts(),
    collectJobBoardSignals({ criteria, productSummary: opts.productSummary, keywords, recencyDays: spec.recencyDays, known, want: Math.min(want, 40), shouldStop }),
  ]);
  for (const [label, outcome] of [["ATS", ats], ["job board", boards]] as const) {
    if (outcome.status === "rejected") console.warn(`[signals] hiring ${label} path failed:`, outcome.reason instanceof Error ? outcome.reason.message : outcome.reason);
  }
  const merged = [...(ats.status === "fulfilled" ? ats.value : []), ...(boards.status === "fulfilled" ? boards.value : [])];
  // A company on both paths keeps its richer ATS signal; same-domain duplicates are folded by rankLeads.
  return merged;
}
