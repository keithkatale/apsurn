import { ACTORS, asNumber, asString, asIsoDate, runApifyActor } from "./apify";
import type { DiscoveredMention, MarketComment, ScanDepth } from "./types";
import { duckDuckGoSearch } from "@/lib/search/duckduckgo";

interface RedditActorItem {
  type?: string;
  id?: string;
  title?: string;
  author?: string;
  subreddit?: string;
  score?: number;
  numComments?: number;
  createdAt?: string;
  url?: string;
  permalink?: string;
  selfText?: string;
  body?: string;
  thumbnail?: string;
  imageUrls?: string[];
}

function redditUrl(item: RedditActorItem): string | null {
  const url = asString(item.url);
  if (url) return url.startsWith("http") ? url : `https://www.reddit.com${url}`;
  const permalink = asString(item.permalink);
  if (permalink) return permalink.startsWith("http") ? permalink : `https://www.reddit.com${permalink}`;
  return null;
}

function toMention(item: RedditActorItem): DiscoveredMention | null {
  if (item.type && item.type !== "post") return null;
  const url = redditUrl(item);
  const content = (asString(item.selfText) || asString(item.title) || asString(item.body) || "").slice(0, 2000);
  if (!url || !content) return null;

  const author = asString(item.author)?.replace(/^u\//i, "") ?? null;
  const comments: MarketComment[] = [];

  return {
    platform: "reddit",
    url,
    authorName: author,
    authorHandle: author ? `u/${author}` : null,
    authorAvatarUrl: null,
    mediaUrl: asString(item.thumbnail) || item.imageUrls?.[0] || null,
    content,
    postedAt: asIsoDate(item.createdAt),
    engagement: {
      likes: asNumber(item.score),
      comments: asNumber(item.numComments),
    },
    comments,
    sentiment: null,
  };
}

function maxPosts(depth: ScanDepth): number {
  return depth === "deep" ? 20 : 12;
}

/** Keyless fallback using DuckDuckGo to search Reddit discussions without any API tokens. */
async function keylessRedditSearch(keyword: string, limit: number): Promise<DiscoveredMention[]> {
  try {
    const hits = await duckDuckGoSearch(`site:reddit.com ${keyword.trim()}`, { limit });
    return hits
      .filter((h) => h.url.includes("reddit.com/r/"))
      .map((h): DiscoveredMention => {
        const authorMatch = /u\/([a-zA-Z0-9_-]+)/i.exec(`${h.title} ${h.snippet}`);
        const author = authorMatch ? authorMatch[1] : null;
        return {
          platform: "reddit",
          url: h.url,
          authorName: author,
          authorHandle: author ? `u/${author}` : null,
          authorAvatarUrl: null,
          mediaUrl: null,
          content: `${h.title}\n\n${h.snippet}`.slice(0, 2000),
          postedAt: h.date ?? new Date().toISOString(),
          engagement: { likes: 0, comments: 0 },
          comments: [],
          sentiment: null,
        };
      });
  } catch {
    return [];
  }
}

export async function searchRedditMentions(keyword: string, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    return keylessRedditSearch(keyword, maxPosts(depth));
  }
  try {
    const items = await runApifyActor<RedditActorItem>(ACTORS.reddit, {
      searchQuery: keyword.trim(),
      sort: depth === "deep" ? "new" : "relevance",
      timeFilter: depth === "deep" ? "month" : "week",
      maxPostsPerSource: maxPosts(depth),
      includeComments: false,
    });
    const mentions = items.flatMap((item) => {
      const mention = toMention(item);
      return mention ? [mention] : [];
    });
    return mentions.length > 0 ? mentions : keylessRedditSearch(keyword, maxPosts(depth));
  } catch {
    return keylessRedditSearch(keyword, maxPosts(depth));
  }
}

export async function redditAccountMentions(handle: string, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  const clean = handle.trim().replace(/^\/?u\//i, "").replace(/^@/, "");
  if (!clean) return [];

  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    return keylessRedditSearch(`author:${clean}`, maxPosts(depth));
  }
  try {
    const items = await runApifyActor<RedditActorItem>(ACTORS.reddit, {
      urls: [`https://www.reddit.com/user/${encodeURIComponent(clean)}/`],
      sort: "new",
      maxPostsPerSource: maxPosts(depth),
      includeComments: false,
    });
    return items.flatMap((item) => {
      const mention = toMention(item);
      return mention ? [mention] : [];
    });
  } catch {
    return keylessRedditSearch(`author:${clean}`, maxPosts(depth));
  }
}
