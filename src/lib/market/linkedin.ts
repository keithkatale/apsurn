import { ACTORS, asNumber, asString, asIsoDate, runApifyActor } from "./apify";
import type { DiscoveredMention, MarketComment, ScanDepth } from "./types";

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
  linkedinUrl?: string;
  url?: string;
  content?: string;
  author?: LinkedInAuthor;
  postedAt?: { date?: string; timestamp?: number };
  engagement?: { likes?: number; comments?: number; shares?: number };
  postImages?: Array<{ url?: string }>;
  comments?: LinkedInComment[];
}

function toMention(item: LinkedInActorItem): DiscoveredMention | null {
  if (item.type && item.type !== "post") return null;
  const url = asString(item.linkedinUrl) || asString(item.url);
  const content = (asString(item.content) || "").slice(0, 2000);
  if (!url || !content) return null;

  const author = item.author ?? {};
  const handle = asString(author.publicIdentifier) || asString(author.universalName);
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

/** harvestapi/linkedin-post-search — keyword listening. Profile-posts cannot search text. */
export async function searchLinkedInMentions(keyword: string, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  const items = await runApifyActor<LinkedInActorItem>(ACTORS.linkedinSearch, {
    searchQueries: [keyword.trim().slice(0, 85)],
    maxPosts: maxPosts(depth),
    sortBy: depth === "deep" ? "date" : "relevance",
    postedLimit: depth === "deep" ? "3months" : "month",
    scrapeComments: false,
    scrapeReactions: false,
  });
  return items.flatMap((item) => {
    const mention = toMention(item);
    return mention ? [mention] : [];
  });
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
}
