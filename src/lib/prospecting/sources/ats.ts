/**
 * Applicant-tracking-system job boards: the intent layer.
 *
 * Greenhouse, Ashby, Lever and Workable each expose a company's entire job
 * board as unauthenticated JSON. That gives two things nothing else free
 * gives: proof a company is hiring for a specific function right now, and —
 * via the posting's publish date — how long that role has gone unfilled. A
 * go-to-market role open for six weeks is a company that has failed to hire
 * the thing we replace, which is the strongest buying signal available here.
 *
 * Board tokens are not published anywhere, so they are guessed from the
 * company's domain (measured: roughly half of hiring companies resolve this
 * way). A miss is a 404, which fetchJson turns into null cheaply.
 */

import { daysSince, fetchJson } from "./client";

export type AtsProvider = "greenhouse" | "ashby" | "lever" | "workable";

export interface AtsRole {
  title: string;
  location: string | null;
  url: string | null;
  publishedAt: string | null;
  ageDays: number | null;
}

export interface AtsBoard {
  provider: AtsProvider;
  token: string;
  companyName: string | null;
  roles: AtsRole[];
}

/** Candidate board tokens for a domain: "acme-hq.io" → ["acmehq", "acme-hq", "acme"]. */
function candidateTokens(domain: string): string[] {
  const label = domain.split(".")[0].toLowerCase();
  const stripped = label.replace(/[^a-z0-9]/g, "");
  const firstWord = label.split(/[^a-z0-9]/)[0];
  return [...new Set([stripped, label, firstWord].filter((t) => t && t.length >= 2))];
}

interface GreenhouseJob {
  title?: string;
  absolute_url?: string;
  first_published?: string;
  updated_at?: string;
  company_name?: string;
  location?: { name?: string };
}

interface AshbyJob {
  title?: string;
  location?: string;
  jobUrl?: string;
  publishedAt?: string;
  isListed?: boolean;
}

interface LeverPosting {
  text?: string;
  hostedUrl?: string;
  createdAt?: number;
  categories?: { location?: string };
}

interface WorkableJob {
  title?: string;
  location?: { city?: string; country?: string };
  url?: string;
  published_on?: string;
}

async function tryGreenhouse(token: string): Promise<AtsBoard | null> {
  const data = await fetchJson<{ jobs?: GreenhouseJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=false`
  );
  if (!data?.jobs?.length) return null;
  return {
    provider: "greenhouse",
    token,
    companyName: data.jobs[0]?.company_name ?? null,
    roles: data.jobs.map((job) => {
      const published = job.first_published ?? job.updated_at ?? null;
      return {
        title: job.title ?? "",
        location: job.location?.name ?? null,
        url: job.absolute_url ?? null,
        publishedAt: published,
        ageDays: daysSince(published),
      };
    }),
  };
}

async function tryAshby(token: string): Promise<AtsBoard | null> {
  const data = await fetchJson<{ jobs?: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}`
  );
  if (!data?.jobs?.length) return null;
  return {
    provider: "ashby",
    token,
    companyName: null,
    roles: data.jobs
      .filter((job) => job.isListed !== false)
      .map((job) => ({
        title: job.title ?? "",
        location: job.location ?? null,
        url: job.jobUrl ?? null,
        publishedAt: job.publishedAt ?? null,
        ageDays: daysSince(job.publishedAt),
      })),
  };
}

async function tryLever(token: string): Promise<AtsBoard | null> {
  const data = await fetchJson<LeverPosting[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`);
  if (!Array.isArray(data) || data.length === 0) return null;
  return {
    provider: "lever",
    token,
    companyName: null,
    roles: data.map((posting) => {
      const published = posting.createdAt ? new Date(posting.createdAt).toISOString() : null;
      return {
        title: posting.text ?? "",
        location: posting.categories?.location ?? null,
        url: posting.hostedUrl ?? null,
        publishedAt: published,
        ageDays: daysSince(published),
      };
    }),
  };
}

async function tryWorkable(token: string): Promise<AtsBoard | null> {
  const data = await fetchJson<{ name?: string; jobs?: WorkableJob[] }>(
    `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(token)}?details=true`
  );
  if (!data?.jobs?.length) return null;
  return {
    provider: "workable",
    token,
    companyName: data.name ?? null,
    roles: data.jobs.map((job) => ({
      title: job.title ?? "",
      location: [job.location?.city, job.location?.country].filter(Boolean).join(", ") || null,
      url: job.url ?? null,
      publishedAt: job.published_on ?? null,
      ageDays: daysSince(job.published_on),
    })),
  };
}

// Ordered by how reliably the token maps to the company that owns the domain.
const PROVIDERS: Array<(token: string) => Promise<AtsBoard | null>> = [tryGreenhouse, tryAshby, tryLever, tryWorkable];

/** Comparable form of a company or board name: lowercase alphanumeric words, legal suffixes dropped. */
function nameTokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word && !/^(inc|llc|ltd|gmbh|corp|co|company|the|group|holdings|technologies|labs)$/.test(word))
  );
}

/**
 * Whether a board plausibly belongs to the company we are asking about.
 *
 * Tokens are guessed from the domain, and guesses collide: probing
 * "rescale" on Workable returns a food-supply-chain company also called
 * Rescale, not the rescale.com we meant. Without this check a collision
 * silently attributes a stranger's open roles to the company being scored,
 * which is worse than finding no board at all.
 */
function boardNameMatches(boardName: string | null, companyName: string | null | undefined): boolean {
  if (!boardName || !companyName) return true; // Nothing to contradict.
  const board = nameTokens(boardName);
  const company = nameTokens(companyName);
  if (board.size === 0 || company.size === 0) return true;

  let shared = 0;
  for (const token of company) if (board.has(token)) shared += 1;
  return shared / Math.min(board.size, company.size) >= 0.8;
}

/**
 * Finds a company's public job board by probing candidate tokens.
 *
 * All four providers are probed concurrently per token — serially this was up
 * to 12 round trips before admitting a company has no board, which at ~50%
 * hit rate is most of them. Null when no board is reachable, which is normal.
 */
export async function findAtsBoard(
  domain: string,
  opts: { companyName?: string | null; signal?: AbortSignal } = {}
): Promise<AtsBoard | null> {
  for (const token of candidateTokens(domain)) {
    if (opts.signal?.aborted) return null;

    const results = await Promise.all(
      PROVIDERS.map(async (probe) => {
        try {
          return await probe(token);
        } catch {
          return null;
        }
      })
    );

    // Provider order is the tie-break, so the result stays deterministic
    // regardless of which probe happened to return first.
    for (const board of results) {
      if (!board || board.roles.length === 0) continue;
      if (!boardNameMatches(board.companyName, opts.companyName)) continue;
      return board;
    }
  }
  return null;
}

/**
 * Roles that indicate the company is building the function our product
 * replaces. Matched against the role title only — job bodies are long,
 * inconsistent, and full of boilerplate that produces false positives.
 */
export function matchRoles(board: AtsBoard, keywords: string[]): AtsRole[] {
  const needles = keywords.map((k) => k.toLowerCase().trim()).filter(Boolean);
  if (needles.length === 0) return [];
  return board.roles.filter((role) => {
    const title = role.title.toLowerCase();
    return needles.some((needle) => title.includes(needle));
  });
}
