import { ACTORS, asNumber, asString, asIsoDate, runApifyActor } from "./apify";
import type { DiscoveredMention, ScanDepth } from "./types";
import { duckDuckGoSearch } from "@/lib/search/duckduckgo";

interface TwitterActorItem {
  type?: string;
  id?: string;
  url?: string;
  text?: string;
  createdAt?: string;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  viewCount?: number;
  authorUsername?: string;
  authorName?: string;
  profilePicture?: string;
  mediaUrls?: string[];
  media?: Array<{ url?: string }>;
  author?: {
    userName?: string;
    name?: string;
    profileImageUrl?: string;
  };
}

function twitterCookie(): string | null {
  return process.env.APIFY_TWITTER_COOKIE?.trim() || null;
}

function toMention(item: TwitterActorItem): DiscoveredMention | null {
  if (item.type && item.type !== "tweet") return null;
  const url = asString(item.url);
  const content = (asString(item.text) || "").slice(0, 2000);
  if (!url || !content) return null;

  const handle = (asString(item.authorUsername) || asString(item.author?.userName) || "").replace(/^@/, "") || null;
  return {
    platform: "twitter",
    url,
    authorName: asString(item.authorName) || asString(item.author?.name) || handle,
    authorHandle: handle ? `@${handle}` : null,
    authorAvatarUrl: asString(item.profilePicture) || asString(item.author?.profileImageUrl),
    mediaUrl: item.mediaUrls?.[0] || item.media?.[0]?.url || null,
    content,
    postedAt: asIsoDate(item.createdAt),
    engagement: {
      likes: asNumber(item.likeCount),
      comments: asNumber(item.replyCount),
      shares: asNumber(item.retweetCount),
      views: asNumber(item.viewCount),
    },
    comments: [],
    sentiment: null,
  };
}

function maxResults(depth: ScanDepth): number {
  return depth === "deep" ? 20 : 12;
}

async function keylessTwitterSearch(keyword: string, limit: number): Promise<DiscoveredMention[]> {
  try {
    const hits = await duckDuckGoSearch(`site:x.com OR site:twitter.com "${keyword.trim()}"`, { limit });
    return hits
      .filter((h) => h.url.includes("x.com/") || h.url.includes("twitter.com/"))
      .map((h): DiscoveredMention => {
        const handleMatch = /(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)\/status/i.exec(h.url);
        const handle = handleMatch ? `@${handleMatch[1]}` : null;
        return {
          platform: "twitter",
          url: h.url,
          authorName: handle ?? "X User",
          authorHandle: handle,
          authorAvatarUrl: null,
          mediaUrl: null,
          content: `${h.title}\n\n${h.snippet}`.slice(0, 2000),
          postedAt: h.date ?? new Date().toISOString(),
          engagement: { likes: 0, comments: 0, shares: 0, views: 0 },
          comments: [],
          sentiment: null,
        };
      });
  } catch {
    return [];
  }
}

export async function searchTwitterMentions(keyword: string, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    return keylessTwitterSearch(keyword, maxResults(depth));
  }
  try {
    const cookie = twitterCookie();
    const items = cookie
      ? await runApifyActor<TwitterActorItem>(ACTORS.twitter, {
          mode: "search",
          searchTerms: [keyword.trim()],
          searchMode: depth === "deep" ? "Latest" : "Top",
          maxResults: maxResults(depth),
          twitterCookie: cookie,
        })
      : await runApifyActor<TwitterActorItem>(ACTORS.twitterSearch, {
          searchTerms: [keyword.trim()],
          sort: depth === "deep" ? "Latest" : "Top",
          maxItems: maxResults(depth),
        });

    const mentions = items.flatMap((item) => {
      const mention = toMention(item);
      return mention ? [mention] : [];
    });
    return mentions.length > 0 ? mentions : keylessTwitterSearch(keyword, maxResults(depth));
  } catch {
    return keylessTwitterSearch(keyword, maxResults(depth));
  }
}

export async function twitterAccountMentions(handle: string, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  const clean = handle.trim().replace(/^@/, "");
  if (!clean) return [];
  if (/\s/.test(clean)) {
    throw new Error("X account scans need the @handle (e.g. alexbecker), not the display name.");
  }

  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    return keylessTwitterSearch(`from:${clean}`, maxResults(depth));
  }
  try {
    const input: Record<string, unknown> = {
      mode: "user-tweets",
      usernames: [clean],
      maxResults: maxResults(depth),
    };
    const cookie = twitterCookie();
    if (cookie) input.twitterCookie = cookie;

    const items = await runApifyActor<TwitterActorItem>(ACTORS.twitter, input);
    return items.flatMap((item) => {
      const mention = toMention(item);
      return mention ? [mention] : [];
    });
  } catch {
    return keylessTwitterSearch(`from:${clean}`, maxResults(depth));
  }
}
