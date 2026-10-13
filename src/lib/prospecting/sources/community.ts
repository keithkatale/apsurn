/**
 * Free, keyless "context" sources: places where companies announce themselves, hire, or join an accelerator in public.
 * Nothing here is a paid API or a database of leads. Every row is something a company did recently, in public,
 * with a date and a link to where it said so.
 *
 *  - Y Combinator Launches: a company's own launch post, with its real website, tags and batch.
 *  - Y Combinator batches: companies newly admitted to the latest batches (the accelerator signal).
 *  - Hacker News: "Show HN" launches, and the monthly "Who is hiring?" thread, where companies post roles themselves.
 *  - Product Hunt: the public Atom feed of new products.
 *  - BetaList: new startups listed this week.
 *
 * Indie Hackers is behind a Cloudflare challenge and is deliberately not scraped: fighting a bot wall is a sign the
 * source is wrong, not a reason to try harder.
 */
import { fetchJson } from "./client";
import {
  batchSlug,
  batchStartDate,
  companyDomainFromUrl,
  htmlToText,
  parseAtomEntries,
  parseBetaListHome,
  parseHiringComment,
  parsePhMakers,
  parseShowHnTitle,
  parseYcFounders,
  recentBatches,
  type HiringPost,
  type YcFounder,
} from "./community-parse";

export { batchStartDate, companyDomainFromUrl, htmlToText, parseAtomEntries, parseBetaListHome, parseHiringComment, parsePhMakers, parseShowHnTitle, parseYcFounders, recentBatches };
export type { HiringPost, YcFounder };

import type { SourcedCompany } from "./types";

const USER_AGENT = "ApsurnBot/1.0 (+https://apsurn.com/bot; contact: privacy@apsurn.com)";
const DAY_MS = 86_400_000;

export type LaunchSource = "yc_launches" | "yc_batch" | "hn_show" | "product_hunt" | "betalist";

export interface CommunityLaunch {
  name: string;
  /** The company's own website host; never an app store, repo host or hosting subdomain. */
  domain: string;
  tagline: string;
  sourceUrl: string;
  /** ISO date of the event itself. */
  date: string | null;
  source: LaunchSource;
  tags: string[];
  batch?: string | null;
  isHiring?: boolean;
  teamSize?: number | null;
  /** Y Combinator company slug, when the company has a YC profile (it lists its founders). */
  ycSlug?: string | null;
  /** Source-specific strength in [0, 1] (votes, points). */
  strength: number;
}

async function fetchText(url: string, init?: { manualRedirect?: boolean }): Promise<{ status: number; text: string; location: string | null } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml,application/atom+xml" },
      redirect: init?.manualRedirect ? "manual" : "follow",
      signal: controller.signal,
    });
    const text = init?.manualRedirect ? "" : await response.text();
    return { status: response.status, text, location: response.headers.get("location") };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Follows redirects one hop at a time (up to 4) and returns the first URL that is a company website. */
export async function resolveOutboundDomain(url: string): Promise<string | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetchText(current, { manualRedirect: true });
    if (!res) return null;
    if (res.status >= 300 && res.status < 400 && res.location) {
      const next = new URL(res.location, current).toString();
      const domain = companyDomainFromUrl(next);
      if (domain) return domain;
      current = next;
      continue;
    }
    return companyDomainFromUrl(current);
  }
  return null;
}

// ── Y Combinator ─────────────────────────────────────────────────────────

interface YcLaunchHit {
  title?: string;
  tagline?: string;
  slug?: string;
  created_at?: string;
  total_vote_count?: number;
  company?: { name?: string; url?: string; slug?: string; tags?: string[]; batch?: string; industry?: string };
}

/** Companies that posted a Launch YC this window: their own words, own website, tags and batch. */
export async function ycLaunches(recencyDays: number, maxPages = 4): Promise<CommunityLaunch[]> {
  const cutoff = Date.now() - recencyDays * DAY_MS;
  const out: CommunityLaunch[] = [];
  for (let page = 0; page < maxPages; page++) {
    const data = await fetchJson<{ hits?: YcLaunchHit[] }>(`https://www.ycombinator.com/launches?page=${page}`);
    const hits = data?.hits ?? [];
    if (hits.length === 0) break;
    let oldest = Number.POSITIVE_INFINITY;
    for (const hit of hits) {
      const time = hit.created_at ? Date.parse(hit.created_at) : NaN;
      if (Number.isFinite(time)) oldest = Math.min(oldest, time);
      const domain = companyDomainFromUrl(hit.company?.url);
      const name = hit.company?.name?.trim();
      if (!domain || !name || !Number.isFinite(time) || time < cutoff) continue;
      out.push({
        name,
        domain,
        tagline: (hit.tagline ?? hit.title ?? "").trim(),
        sourceUrl: hit.slug ? `https://www.ycombinator.com/launches/${hit.slug}` : "https://www.ycombinator.com/launches",
        date: new Date(time).toISOString(),
        source: "yc_launches",
        tags: hit.company?.tags ?? [],
        batch: hit.company?.batch ?? null,
        ycSlug: hit.company?.slug ?? null,
        strength: Math.min(1, 0.6 + (hit.total_vote_count ?? 0) / 200),
      });
    }
    if (oldest < cutoff) break;
  }
  return out;
}

interface YcBatchCompany {
  name?: string;
  website?: string;
  one_liner?: string;
  batch?: string;
  tags?: string[];
  team_size?: number;
  isHiring?: boolean;
  url?: string;
  launched_at?: number;
}

/** Companies newly admitted to the latest Y Combinator batches. Joining an accelerator is a signal on its own. */
export async function ycNewBatchCompanies(recencyDays: number, now = new Date()): Promise<CommunityLaunch[]> {
  const out: CommunityLaunch[] = [];
  for (const batch of recentBatches(now, 3)) {
    const start = batchStartDate(batch);
    if (!start || (now.getTime() - Date.parse(start)) / DAY_MS > recencyDays) continue;
    const rows = await fetchJson<YcBatchCompany[]>(`https://yc-oss.github.io/api/batches/${batchSlug(batch)}.json`);
    for (const row of rows ?? []) {
      const domain = companyDomainFromUrl(row.website);
      const name = row.name?.trim();
      if (!domain || !name) continue;
      out.push({
        name,
        domain,
        tagline: (row.one_liner ?? "").trim(),
        sourceUrl: row.url ?? `https://www.ycombinator.com/companies?batch=${encodeURIComponent(batch)}`,
        date: start,
        source: "yc_batch",
        tags: row.tags ?? [],
        batch: row.batch ?? batch,
        isHiring: Boolean(row.isHiring),
        teamSize: row.team_size ?? null,
        ycSlug: row.url?.match(/\/companies\/([a-z0-9-]+)/i)?.[1] ?? null,
        strength: row.isHiring ? 0.8 : 0.65,
      });
    }
  }
  return out;
}

// ── Hacker News (Algolia, keyless) ───────────────────────────────────────

interface HnHit {
  objectID: string;
  title?: string;
  url?: string | null;
  author?: string;
  points?: number | null;
  num_comments?: number | null;
  created_at?: string;
  created_at_i?: number;
  comment_text?: string | null;
  parent_id?: number | null;
  story_id?: number | null;
}

/** Recent Show HN and Launch HN posts that link to a company's own website. */
export async function hnShowLaunches(recencyDays: number): Promise<CommunityLaunch[]> {
  const since = Math.floor((Date.now() - recencyDays * DAY_MS) / 1000);
  const url = `https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}&hitsPerPage=100`;
  const launchUrl = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent('"Launch HN"')}&tags=story&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}&hitsPerPage=50`;
  const [show, launch] = await Promise.all([fetchJson<{ hits?: HnHit[] }>(url), fetchJson<{ hits?: HnHit[] }>(launchUrl)]);
  const out: CommunityLaunch[] = [];
  const seen = new Set<string>();
  for (const hit of [...(launch?.hits ?? []), ...(show?.hits ?? [])]) {
    const domain = companyDomainFromUrl(hit.url);
    const parsed = hit.title ? parseShowHnTitle(hit.title) : null;
    if (!domain || !parsed || seen.has(domain)) continue;
    seen.add(domain);
    const points = hit.points ?? 0;
    out.push({
      name: parsed.name,
      domain,
      tagline: parsed.tagline,
      sourceUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      date: hit.created_at ?? null,
      source: "hn_show",
      tags: [],
      strength: Math.min(1, 0.4 + points / 150),
    });
  }
  return out;
}

async function latestHiringThreadId(): Promise<string | null> {
  const data = await fetchJson<{ hits?: HnHit[] }>("https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=6");
  const thread = (data?.hits ?? []).find((hit) => /who is hiring/i.test(hit.title ?? ""));
  return thread?.objectID ?? null;
}

/** Top-level posts of the latest "Ask HN: Who is hiring?" thread: companies announcing roles in their own words. */
export async function hnHiringPosts(recencyDays: number): Promise<HiringPost[]> {
  const threadId = await latestHiringThreadId();
  if (!threadId) return [];
  const since = Math.floor((Date.now() - recencyDays * DAY_MS) / 1000);
  const posts: HiringPost[] = [];
  for (let page = 0; page < 3; page++) {
    const data: { hits?: HnHit[]; nbPages?: number } | null = await fetchJson<{ hits?: HnHit[]; nbPages?: number }>(
      `https://hn.algolia.com/api/v1/search_by_date?tags=comment,story_${threadId}&numericFilters=${encodeURIComponent(`created_at_i>${since}`)}&hitsPerPage=500&page=${page}`,
    );
    for (const hit of data?.hits ?? []) {
      // Only top-level comments are job posts; replies are questions.
      if (!hit.comment_text || String(hit.parent_id) !== threadId) continue;
      const parsed = parseHiringComment(hit.comment_text);
      if (!parsed) continue;
      posts.push({ ...parsed, postedAt: hit.created_at ?? null, sourceUrl: `https://news.ycombinator.com/item?id=${hit.objectID}` });
    }
    if (page + 1 >= (data?.nbPages ?? 1)) break;
  }
  return posts;
}

/** HN "Who is hiring?" posts as sourced companies, in the shape the job-board path already consumes. */
export async function hnWhoIsHiringCompanies(opts: { keywords?: string[]; recencyDays?: number; limit?: number }): Promise<SourcedCompany[]> {
  const needles = (opts.keywords ?? []).map((k) => k.toLowerCase().trim()).filter(Boolean);
  const posts = await hnHiringPosts(opts.recencyDays ?? 35);
  const out: SourcedCompany[] = [];
  const seen = new Set<string>();
  for (const post of posts) {
    const haystack = `${post.roles} ${post.text}`.toLowerCase();
    if (needles.length && !needles.some((needle) => haystack.includes(needle))) continue;
    const domain = companyDomainFromUrl(post.url);
    const key = domain ?? post.company.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: post.company,
      domain,
      description: post.roles,
      location: post.location,
      employeeBand: null,
      phone: null,
      contactName: null,
      contactTitle: null,
      source: "hn_who_is_hiring",
      sourceUrl: post.sourceUrl,
      signal: "Hiring",
      signalEvidence: `Hiring: "${post.roles.slice(0, 140)}"`,
      signalDate: post.postedAt,
    });
    if (out.length >= (opts.limit ?? 60)) break;
  }
  return out;
}

// ── Product Hunt (public Atom feed) ──────────────────────────────────────

const RESOLVE_CONCURRENCY = 5;

async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        out[index] = await work(items[index]);
      }
    }),
  );
  return out;
}

/** New Product Hunt products whose outbound link goes to a company's own website. */
export async function productHuntLaunches(recencyDays: number, max = 40): Promise<CommunityLaunch[]> {
  const res = await fetchText("https://www.producthunt.com/feed");
  if (!res || res.status !== 200) return [];
  const cutoff = Date.now() - recencyDays * DAY_MS;
  const entries = parseAtomEntries(res.text)
    .filter((entry) => entry.outbound && entry.published && Date.parse(entry.published) >= cutoff)
    .slice(0, max);
  const resolved = await mapLimit(entries, RESOLVE_CONCURRENCY, async (entry) => ({ entry, domain: await resolveOutboundDomain(entry.outbound as string) }));
  return resolved.flatMap(({ entry, domain }): CommunityLaunch[] =>
    domain
      ? [{ name: entry.title, domain, tagline: entry.summary, sourceUrl: entry.link, date: entry.published ? new Date(entry.published).toISOString() : null, source: "product_hunt", tags: [], strength: 0.6 }]
      : [],
  );
}

// ── BetaList ─────────────────────────────────────────────────────────────

/** New startups listed on BetaList, each resolved to its own website. BetaList has no dates, so these count as this week. */
export async function betaListLaunches(max = 30): Promise<CommunityLaunch[]> {
  const home = await fetchText("https://betalist.com");
  if (!home || home.status !== 200) return [];
  const rows = parseBetaListHome(home.text).slice(0, max);
  const now = new Date().toISOString();
  const resolved = await mapLimit(rows, RESOLVE_CONCURRENCY, async (row) => ({ row, domain: await resolveOutboundDomain(`https://betalist.com/startups/${row.slug}/visit`) }));
  return resolved.flatMap(({ row, domain }): CommunityLaunch[] =>
    domain ? [{ name: row.name, domain, tagline: row.tagline, sourceUrl: `https://betalist.com/startups/${row.slug}`, date: now, source: "betalist", tags: [], strength: 0.5 }] : [],
  );
}

/** The founders a Y Combinator company lists on its public page: real names, titles and profile links, free. */
export async function ycCompanyFounders(slug: string): Promise<YcFounder[]> {
  const res = await fetchText(`https://www.ycombinator.com/companies/${encodeURIComponent(slug)}`);
  return res && res.status === 200 ? parseYcFounders(res.text) : [];
}

/** The makers a Product Hunt product page names. */
export async function productHuntMakers(productUrl: string): Promise<string[]> {
  if (!/^https:\/\/www\.producthunt\.com\/products\//.test(productUrl)) return [];
  const res = await fetchText(productUrl);
  return res && res.status === 200 ? parsePhMakers(res.text) : [];
}
