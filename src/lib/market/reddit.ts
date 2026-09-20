/**
 * Reddit discovery and enrichment via Reddit's public Atom feeds.
 *
 * Why feeds: Reddit's JSON endpoints (`/comments/<id>.json`,
 * `/user/<name>/about.json`) now answer 403 to unauthenticated clients, and
 * third-party mirrors are blocked the same way — which is why every Reddit
 * mention displayed "Unknown author". The `.rss` feeds are still served
 * without credentials and carry the poster's real username, the real post
 * body, the real timestamp, and the real comment authors, so mentions can be
 * built from actual data instead of asking a model to recall it.
 *
 * Reddit rate-limits these feeds aggressively (HTTP 429 after a short burst,
 * and datacenter ranges are treated more harshly than residential ones), so
 * every request here is serialized behind a shared queue with a politeness
 * delay, and a 429 trips a cooldown that makes the rest of the scan skip
 * Reddit's feeds and fall back to search-grounding rather than hammering.
 */

import * as cheerio from "cheerio";
import type { MarketComment } from "./types";

const USER_AGENT = "apsurn-market-insights/1.0 (+https://apsurn.com)";
const REQUEST_TIMEOUT_MS = 20_000;
const POLITENESS_DELAY_MS = 1_200;
const COOLDOWN_MS = 5 * 60_000;

export interface RedditPost {
  url: string;
  title: string;
  authorHandle: string | null;
  content: string;
  postedAt: string | null;
  comments: MarketComment[];
}

let cooldownUntil = 0;
let queue: Promise<unknown> = Promise.resolve();

/** True when a recent 429 means Reddit's feeds should be left alone for now. */
export function redditFeedsCoolingDown(): boolean {
  return Date.now() < cooldownUntil;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Serializes every feed request app-wide and spaces them out, so concurrent scans don't collectively trip the limiter. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const result = await task();
    await sleep(POLITENESS_DELAY_MS);
    return result;
  });
  queue = run.catch(() => undefined);
  return run as Promise<T>;
}

async function fetchFeed(url: string): Promise<string | null> {
  if (redditFeedsCoolingDown()) return null;

  return enqueue(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml, application/xml" },
        signal: controller.signal,
      });
      if (response.status === 429) {
        cooldownUntil = Date.now() + COOLDOWN_MS;
        console.warn("[market/reddit] rate-limited by Reddit; backing off for 5 minutes");
        return null;
      }
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  });
}

/** Reddit renders feed bodies as escaped HTML; strip it back to readable text. */
function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("a[href^='/r/'], a[href*='reddit.com/r/']").each((_, el) => {
    // Keep subreddit link text, drop the markup around it.
    $(el).replaceWith($(el).text());
  });
  return $.root().text().replace(/\s+/g, " ").trim();
}

function normalizeAuthor(raw: string | undefined): string | null {
  const handle = (raw ?? "").trim().replace(/^\/?u\//i, "");
  if (!handle || handle === "[deleted]") return null;
  return `u/${handle}`;
}

/** A permalink is .../r/<sub>/comments/<id>/<slug>/ — the subreddit is always recoverable from it. */
export function subredditFromUrl(url: string): string | null {
  const match = url.match(/reddit\.com\/r\/([A-Za-z0-9_]+)/i);
  return match ? `r/${match[1]}` : null;
}

interface ParsedEntry {
  title: string;
  link: string;
  author: string | null;
  updated: string | null;
  content: string;
}

function parseEntries(xml: string): ParsedEntry[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("entry")
    .toArray()
    .map((el) => {
      const entry = $(el);
      const updated = entry.find("updated").first().text().trim();
      return {
        title: entry.find("title").first().text().trim(),
        link: entry.find("link").first().attr("href")?.trim() ?? "",
        author: normalizeAuthor(entry.find("author > name").first().text()),
        updated: updated && !Number.isNaN(Date.parse(updated)) ? new Date(updated).toISOString() : null,
        content: htmlToText(entry.find("content").first().text()),
      };
    });
}

/** A post permalink, without the comment id that comment entries carry. */
function isPostPermalink(link: string): boolean {
  return /\/comments\/[a-z0-9]+\/[^/]*\/?$/i.test(link);
}

/**
 * Searches Reddit directly for a keyword. Returns real posts with real
 * authors, or null when the feed is unavailable (rate-limited/blocked), so
 * the caller can fall back to search-grounding rather than treat it as
 * "nothing was found".
 */
export async function searchRedditPosts(keyword: string, limit = 25): Promise<RedditPost[] | null> {
  // Relevance over recency, and the keyword quoted for phrase matching:
  // `sort=new` returns the newest posts Reddit's index touched rather than
  // the ones actually about the keyword (a "CRM software" search came back
  // with CS-career resume threads).
  const query = /\s/.test(keyword.trim()) ? `"${keyword.trim()}"` : keyword.trim();
  const url = `https://www.reddit.com/search.rss?q=${encodeURIComponent(query)}&sort=relevance&t=year&limit=${Math.min(100, limit)}`;
  const xml = await fetchFeed(url);
  if (!xml) return null;

  const posts: RedditPost[] = [];
  const seen = new Set<string>();
  for (const entry of parseEntries(xml)) {
    if (!entry.link || !isPostPermalink(entry.link) || seen.has(entry.link)) continue;
    seen.add(entry.link);
    posts.push({
      url: entry.link,
      title: entry.title,
      authorHandle: entry.author,
      content: entry.content || entry.title,
      postedAt: entry.updated,
      comments: [],
    });
    if (posts.length >= limit) break;
  }
  return posts;
}

/** Recent posts submitted by one redditor, for a followed account. Null when the feed is unavailable. */
export async function redditUserPosts(handle: string, limit = 25): Promise<RedditPost[] | null> {
  const clean = handle.trim().replace(/^\/?u\//i, "").replace(/^@/, "");
  if (!clean) return null;

  const xml = await fetchFeed(`https://www.reddit.com/user/${encodeURIComponent(clean)}/submitted.rss?limit=${Math.min(100, limit)}`);
  if (!xml) return null;

  const posts: RedditPost[] = [];
  const seen = new Set<string>();
  for (const entry of parseEntries(xml)) {
    if (!entry.link || !isPostPermalink(entry.link) || seen.has(entry.link)) continue;
    seen.add(entry.link);
    posts.push({
      url: entry.link,
      title: entry.title,
      authorHandle: entry.author ?? `u/${clean}`,
      content: entry.content || entry.title,
      postedAt: entry.updated,
      comments: [],
    });
    if (posts.length >= limit) break;
  }
  return posts;
}

/**
 * Fills in the real author, body, timestamp and top comments for a single
 * known post URL. Used to repair mentions discovered through search
 * grounding, which supplies a URL but no trustworthy byline.
 */
export async function enrichRedditPost(postUrl: string): Promise<RedditPost | null> {
  const base = postUrl.split("?")[0].replace(/\/$/, "");
  const xml = await fetchFeed(`${base}/.rss?limit=4`);
  if (!xml) return null;

  const entries = parseEntries(xml);
  if (entries.length === 0) return null;

  // The first entry is the post itself; the rest are comments, each with its
  // own author — which is also where the real discussion text lives.
  const [post, ...rest] = entries;
  const comments: MarketComment[] = rest
    .filter((entry) => entry.content)
    .slice(0, 3)
    .map((entry) => ({ author: entry.author, content: entry.content.slice(0, 500) }));

  return {
    url: post.link || postUrl,
    title: post.title,
    authorHandle: post.author,
    content: post.content || post.title,
    postedAt: post.updated,
    comments,
  };
}
