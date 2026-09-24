import { ACTORS, asNumber, asString, asIsoDate, runApifyActor } from "./apify";
import type { DiscoveredMention, ScanDepth } from "./types";

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

/**
 * Keyword search. automation-lab/twitter-scraper search mode needs x.com
 * cookies; dami_studio/twitter-search-scraper already carries a session, so
 * mentions work without APIFY_TWITTER_COOKIE.
 */
export async function searchTwitterMentions(keyword: string, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
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

  return items.flatMap((item) => {
    const mention = toMention(item);
    return mention ? [mention] : [];
  });
}

export async function twitterAccountMentions(handle: string, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  const clean = handle.trim().replace(/^@/, "");
  if (!clean) return [];
  if (/\s/.test(clean)) {
    throw new Error("X account scans need the @handle (e.g. alexbecker), not the display name.");
  }

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
}
