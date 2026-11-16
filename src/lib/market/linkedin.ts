import { ACTORS, asNumber, asString, asIsoDate, runApifyActor } from "./apify";
import type { DiscoveredMention, MarketComment, ScanDepth } from "./types";
import { duckDuckGoSearch } from "@/lib/search/duckduckgo";

interface LinkedInAuthor {
  name?: string;
  publicIdentifier?: string;
  universalName?: string;
  linkedinUrl?: string;
  avatar?: { url?: string };
  pictureUrl?: string;
}

interface LinkedInComment {
  author?: { name?: string };
  commentary?: string;
  text?: string;
}

interface LinkedInActorItem {
  type?: string;
  url?: string;
  postUrl?: string;
  text?: string;
  content?: string;
  author?: LinkedInAuthor;
  postedAt?: { date?: string; timestamp?: string };
  engagement?: { likes?: number; comments?: number; shares?: number };
  comments?: LinkedInComment[];
  postImages?: Array<{ url?: string }>;
}

function toMention(item: LinkedInActorItem): DiscoveredMention | null {
  const url = asString(item.url) || asString(item.postUrl);
  const content = (asString(item.text) || asString(item.content) || "").slice(0, 2000);
  if (!url || !content) return null;

  const author = item.author || {};
  const handle = asString(author.publicIdentifier) || asString(author.universalName) || null;

  const comments: MarketComment[] = Array.isArray(item.comments)
    ? item.comments
        .flatMap((comment) => {
          const text = (asString(comment.commentary) || asString(comment.text) || "").slice(0, 500);
          if (!text) return [];
          return [{ author: asString(comment.author?.name), content: text }];
        })
        .slice(0, 3)
    : [];

  return {
    platform: "linkedin",
    url,
    authorName: asString(author.name) || handle,
    authorHandle: handle,
    authorAvatarUrl: asString(author.avatar?.url) || asString(author.pictureUrl),
    mediaUrl: item.postImages?.[0]?.url || null,
    content,
    postedAt: asIsoDate(item.postedAt?.date) || asIsoDate(item.postedAt?.timestamp),
    engagement: {
      likes: asNumber(item.engagement?.likes),
      comments: asNumber(item.engagement?.comments),
      shares: asNumber(item.engagement?.shares),
    },
    comments,
    sentiment: null,
  };
}

function maxPosts(depth: ScanDepth): number {
  return depth === "deep" ? 12 : 8;
}

async function keylessLinkedInSearch(keyword: string, limit: number): Promise<DiscoveredMention[]> {
  try {
    const hits = await duckDuckGoSearch(`site:linkedin.com/posts OR site:linkedin.com/pulse "${keyword.trim()}"`, { limit });
    return hits
      .filter((h) => h.url.includes("linkedin.com"))
      .map((h): DiscoveredMention => ({
        platform: "linkedin",
        url: h.url,
        authorName: h.title.split(/[-–|]/)[0].trim() || "LinkedIn Author",
        authorHandle: null,
        authorAvatarUrl: null,
        mediaUrl: null,
        content: `${h.title}\n\n${h.snippet}`.slice(0, 2000),
        postedAt: h.date ?? new Date().toISOString(),
        engagement: { likes: 0, comments: 0, shares: 0 },
        comments: [],
        sentiment: null,
      }));
  } catch {
    return [];
  }
}

/** harvestapi/linkedin-post-search — keyword listening. Profile-posts cannot search text. Falls back to keyless DuckDuckGo. */
export async function searchLinkedInMentions(keyword: string, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    return keylessLinkedInSearch(keyword, maxPosts(depth));
  }
  try {
    const items = await runApifyActor<LinkedInActorItem>(ACTORS.linkedinSearch, {
      searchQueries: [keyword.trim().slice(0, 85)],
      maxPosts: maxPosts(depth),
      sortBy: depth === "deep" ? "date" : "relevance",
      postedLimit: depth === "deep" ? "3months" : "month",
      scrapeComments: false,
      scrapeReactions: false,
    });
    const mentions = items.flatMap((item) => {
      const mention = toMention(item);
      return mention ? [mention] : [];
    });
    return mentions.length > 0 ? mentions : keylessLinkedInSearch(keyword, maxPosts(depth));
  } catch {
    return keylessLinkedInSearch(keyword, maxPosts(depth));
  }
}

function linkedInTargetUrl(handle: string): string | null {
  const raw = handle.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/linkedin\.com\//i.test(raw)) return `https://${raw.replace(/^\/+/, "")}`;
  if (/^(in|company|school)\//i.test(raw)) return `https://www.linkedin.com/${raw.replace(/^\/+/, "")}`;
  if (raw.includes(" ")) return null;
  return `https://www.linkedin.com/in/${raw.replace(/^@/, "")}`;
}

/** harvestapi/linkedin-profile-posts — posts from a followed profile or company page. */
export async function linkedInAccountMentions(handle: string, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  const target = linkedInTargetUrl(handle);
  if (!target) {
    throw new Error("LinkedIn account scans need a profile URL or public slug (e.g. linkedin.com/in/name).");
  }

  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    return keylessLinkedInSearch(`"${handle}"`, maxPosts(depth));
  }
  try {
    const items = await runApifyActor<LinkedInActorItem>(ACTORS.linkedinProfile, {
      targetUrls: [target],
      maxPosts: maxPosts(depth),
      scrapeComments: false,
      scrapeReactions: false,
    });
    return items.flatMap((item) => {
      const mention = toMention(item);
      return mention ? [mention] : [];
    });
  } catch {
    return keylessLinkedInSearch(`"${handle}"`, maxPosts(depth));
  }
}
