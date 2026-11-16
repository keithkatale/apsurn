/** Radar sources: free APIs that feed RawSignal into the unified engine. */
import type { RadarSource } from "./types.ts";
import { parseAtsJobs, parseBluesky, parseDiscourse, parseGdelt, parseGithubIssues, parseHnHiring, parseHnIntent, parseLemmy, parseSecFormD, parseStackExchange } from "./parse.ts";

const HN_ALGOLIA = "https://hn.algolia.com/api/v1/search_by_date";
const SEC_EDGAR = "https://www.sec.gov/edgar-json";
const GDELT_DOC = "https://api.gdeltproject.org/api/v2/doc/doc";

function timeoutSignal(seconds: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), seconds * 1000);
  return c.signal;
}

/** Hacker News "looking for X", "alternative to X" intent via Algolia. No key needed. */
export const hnIntent: RadarSource = {
  id: "hn_intent",
  label: "Hacker News Intent",
  minIntervalMs: 60 * 60_000,
  available: (watch) => (!watch.keywords?.length ? "No keywords configured" : null),
  async fetch(ctx) {
    const phrases = ctx.watch.keywords.slice(0, 2).map((k) => `"${k}" OR "alternative to ${k}" OR "${k} alternative"`).join(" OR ");
    if (!phrases) return [];
    const url = new URL(HN_ALGOLIA);
    url.searchParams.set("tags", "ask_hn,show_hn");
    url.searchParams.set("query", phrases);
    url.searchParams.set("hitsPerPage", String(Math.min(ctx.limit, 20)));
    try {
      const res = await fetch(url, { signal: timeoutSignal(10) });
      if (!res.ok) return [];
      return parseHnIntent(await res.json());
    } catch {
      return [];
    }
  },
};

/** "Who is hiring" threads on HN, parsed monthly. No key needed. */
export const hnHiring: RadarSource = {
  id: "hn_hiring",
  label: "Hacker News Who's Hiring",
  minIntervalMs: 24 * 60 * 60_000,
  available: () => null,
  async fetch(ctx) {
    const url = new URL(HN_ALGOLIA);
    url.searchParams.set("tags", "ask_hn");
    url.searchParams.set("query", '"who is hiring"');
    url.searchParams.set("hitsPerPage", String(Math.min(ctx.limit, 100)));
    try {
      const res = await fetch(url, { signal: timeoutSignal(10) });
      if (!res.ok) return [];
      return parseHnHiring(await res.json());
    } catch {
      return [];
    }
  },
};

/** SEC EDGAR Form D new private funding filings. No key needed, but filtering is expensive. */
export const secFormD: RadarSource = {
  id: "sec_form_d",
  label: "SEC Form D Funding",
  minIntervalMs: 4 * 60 * 60_000,
  available: () => null,
  async fetch(ctx) {
    const phrases = [...(ctx.watch.keywords ?? []), ...(ctx.watch.competitors ?? [])]
      .slice(0, 3)
      .filter((x) => x?.length >= 2)
      .map((x) => `"${x}"`)
      .join(" OR ");
    if (!phrases) return [];
    const url = new URL(SEC_EDGAR);
    url.searchParams.set("filenum", "formtype==D");
    url.searchParams.set("query", `(${phrases})`);
    url.searchParams.set("from", new Date(Date.now() - 30 * 86_400_000).toISOString().split("T")[0]);
    url.searchParams.set("count", String(Math.min(ctx.limit, 100)));
    try {
      const res = await fetch(url, { signal: timeoutSignal(15) });
      if (!res.ok) return [];
      return parseSecFormD(await res.json());
    } catch {
      return [];
    }
  },
};

/** GDELT 2.0 global news search. Free, no key. One request per 5 seconds. */
export const gdelt: RadarSource = {
  id: "gdelt_news",
  label: "GDELT News",
  minIntervalMs: 5 * 60_000,
  available: (watch) => (!watch.keywords?.length ? "No keywords configured" : null),
  async fetch(ctx) {
    const keyword = ctx.watch.keywords[0];
    if (!keyword) return [];
    const url = new URL(GDELT_DOC);
    url.searchParams.set("query", keyword);
    url.searchParams.set("mode", "artlist");
    url.searchParams.set("format", "json");
    url.searchParams.set("sort", "date");
    url.searchParams.set("maxrecords", String(Math.min(ctx.limit, 50)));
    url.searchParams.set("timespan", "30d");
    try {
      const res = await fetch(url, { signal: timeoutSignal(10) });
      if (!res.ok) return [];
      return parseGdelt(await res.json());
    } catch {
      return [];
    }
  },
};

/** Bluesky public posts via AppView. Free, no key. */
export const bluesky: RadarSource = {
  id: "bluesky",
  label: "Bluesky",
  minIntervalMs: 60 * 60_000,
  available: (watch) => (!watch.keywords?.length ? "No keywords configured" : null),
  async fetch(ctx) {
    const keyword = ctx.watch.keywords[0];
    if (!keyword) return [];
    const url = new URL("https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts");
    url.searchParams.set("q", keyword);
    url.searchParams.set("limit", String(Math.min(ctx.limit, 100)));
    url.searchParams.set("sort", "latest");
    try {
      const res = await fetch(url, { signal: timeoutSignal(10) });
      if (!res.ok) return [];
      return parseBluesky(await res.json());
    } catch {
      return [];
    }
  },
};

/** GitHub Issues + Discussions where keywords are mentioned. Free, optional token for higher rate limits. */
export const github: RadarSource = {
  id: "github",
  label: "GitHub",
  minIntervalMs: 60 * 60_000,
  available: (watch) => (!watch.keywords?.length ? "No keywords configured" : null),
  async fetch(ctx) {
    const keywords = ctx.watch.keywords.slice(0, 2);
    if (!keywords.length) return [];
    const q = keywords.map((k) => `"${k}"`).join(" OR ");
    const url = new URL("https://api.github.com/search/issues");
    url.searchParams.set("q", `${q} type:issue sort:created`);
    url.searchParams.set("per_page", String(Math.min(ctx.limit, 100)));
    try {
      const res = await fetch(url, { signal: timeoutSignal(10) });
      if (!res.ok) return [];
      return parseGithubIssues(await res.json());
    } catch {
      return [];
    }
  },
};

/** Discourse forum searches. Requires a forum URL list (e.g., audacityteam.org, forums.obsidian.md). */
export const forums: RadarSource = {
  id: "forums",
  label: "Discourse, Stack Exchange, Lemmy",
  minIntervalMs: 2 * 60 * 60_000,
  available: (watch) => (!watch.forums?.length ? "No forums configured" : null),
  async fetch(ctx) {
    if (!ctx.watch.forums?.length || !ctx.watch.keywords?.length) return [];
    const keyword = ctx.watch.keywords[0];
    const out = [];
    for (const forum of ctx.watch.forums.slice(0, 3)) {
      try {
        if (/^stackexchange:/.test(forum)) {
          const site = forum.replace(/^stackexchange:/, "");
          const url = new URL("https://api.stackexchange.com/2.3/search");
          url.searchParams.set("intitle", keyword);
          url.searchParams.set("site", site);
          url.searchParams.set("pagesize", "20");
          url.searchParams.set("sort", "creation");
          url.searchParams.set("order", "desc");
          const res = await fetch(url, { signal: timeoutSignal(5) });
          if (res.ok) out.push(...parseStackExchange(await res.json(), site));
        } else if (/^lemmy:/.test(forum)) {
          const host = forum.replace(/^lemmy:/, "");
          const url = new URL(`https://${host}/api/v3/search`);
          url.searchParams.set("q", keyword);
          url.searchParams.set("type_", "Posts");
          url.searchParams.set("sort", "New");
          url.searchParams.set("limit", "20");
          const res = await fetch(url, { signal: timeoutSignal(5) });
          if (res.ok) out.push(...parseLemmy(await res.json(), host));
        } else {
          const url = new URL(`https://${forum}/search.json`);
          url.searchParams.set("q", keyword);
          url.searchParams.set("in", "first");
          url.searchParams.set("order", "latest");
          url.searchParams.set("max_posts", "20");
          const res = await fetch(url, { signal: timeoutSignal(5) });
          if (res.ok) out.push(...parseDiscourse(await res.json(), forum));
        }
      } catch {
        continue;
      }
    }
    return out.slice(0, ctx.limit);
  },
};

/** Greenhouse, Lever, Ashby public job boards. No key needed, per-company. */
export const atsHiring: RadarSource = {
  id: "ats_hiring",
  label: "ATS Job Boards",
  minIntervalMs: 24 * 60 * 60_000,
  available: (watch) => (!watch.atsBoards?.length ? "No ATS boards configured" : null),
  async fetch(ctx) {
    if (!ctx.watch.atsBoards?.length) return [];
    const out = [];
    for (const board of ctx.watch.atsBoards.slice(0, 5)) {
      try {
        if (board.ats === "greenhouse") {
          const url = `https://boards-api.greenhouse.io/v1/boards/${board.slug}/jobs?content=true`;
          const res = await fetch(url, { signal: timeoutSignal(10) });
          if (res.ok) out.push(...parseAtsJobs("greenhouse", board.slug, await res.json(), ctx.watch.keywords || []));
        } else if (board.ats === "lever") {
          const url = `https://api.lever.co/v0/postings/${board.slug}?mode=json`;
          const res = await fetch(url, { signal: timeoutSignal(10) });
          if (res.ok) out.push(...parseAtsJobs("lever", board.slug, await res.json(), ctx.watch.keywords || []));
        } else {
          const url = `https://api.ashbyhq.com/posting-api/job-board/${board.slug}?includeCompensation=true`;
          const res = await fetch(url, { signal: timeoutSignal(10) });
          if (res.ok) out.push(...parseAtsJobs("ashby", board.slug, await res.json(), ctx.watch.keywords || []));
        }
      } catch {
        continue;
      }
    }
    return out.slice(0, ctx.limit);
  },
};

export const ALL_SOURCES: RadarSource[] = [hnIntent, hnHiring, secFormD, gdelt, bluesky, github, forums, atsHiring];
