import { ACTORS, asNumber, asString, asIsoDate, runApifyActor } from "./apify";
import type { DiscoveredMention, MarketComment, ScanDepth } from "./types";

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

export async function searchRedditMentions(keyword: string, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  const items = await runApifyActor<RedditActorItem>(ACTORS.reddit, {
    searchQuery: keyword.trim(),
    sort: depth === "deep" ? "new" : "relevance",
    timeFilter: depth === "deep" ? "month" : "week",
    maxPostsPerSource: maxPosts(depth),
    includeComments: false,
  });
  return items.flatMap((item) => {
    const mention = toMention(item);
    return mention ? [mention] : [];
  });
}

export async function redditAccountMentions(handle: string, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  const clean = handle.trim().replace(/^\/?u\//i, "").replace(/^@/, "");
  if (!clean) return [];

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
}
