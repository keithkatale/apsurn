import { getAiClient } from "@/lib/ai/openai";
import { webSearchResults } from "@/lib/search/web-search";
import {
  enrichRedditPost,
  redditFeedsCoolingDown,
  redditUserPosts,
  searchRedditPosts,
  subredditFromUrl,
  type RedditPost,
} from "./reddit";
import type { MarketComment, MarketEngagement, MarketPlatform, MarketSentiment } from "./types";

// Google Search grounding ignores `site:` operators (a site:-scoped query
// returns zero sources), so platform scoping is done by filtering the
// resolved result domains instead. See src/lib/search/web-search.ts.
const PLATFORM_DOMAINS: Record<MarketPlatform, string[]> = {
  twitter: ["twitter.com", "x.com"],
  reddit: ["reddit.com"],
  youtube: ["youtube.com", "youtu.be"],
  linkedin: ["linkedin.com"],
};

const PLATFORM_SITE: Record<MarketPlatform, string> = {
  twitter: "X/Twitter",
  reddit: "Reddit",
  youtube: "YouTube",
  linkedin: "LinkedIn",
};

/** Platforms that block search-engine indexing of post content, so Google-backed discovery can never see them. */
const UNINDEXED_PLATFORMS = new Set<MarketPlatform>(["twitter", "linkedin"]);

const AUTHOR_GUIDANCE: Record<MarketPlatform, string> = {
  reddit:
    'authorHandle MUST be the individual redditor who posted, formatted as "u/username" — never the subreddit name (e.g. never "r/something"). Open the post and read the byline to find the actual poster; if you truly cannot determine the poster, set authorHandle to null rather than substituting the subreddit.',
  twitter: 'authorHandle is the poster\'s @handle (e.g. "@name").',
  youtube: "authorHandle is the channel name or @handle that published the video.",
  linkedin: "authorHandle is the person's or page's LinkedIn handle/slug if visible in the URL or page.",
};

export interface DiscoveredMention {
  platform: MarketPlatform;
  url: string;
  authorName: string | null;
  authorHandle: string | null;
  authorAvatarUrl: string | null;
  mediaUrl: string | null;
  content: string;
  postedAt: string | null;
  engagement: MarketEngagement;
  comments: MarketComment[];
  sentiment: MarketSentiment | null;
}

/** youtube.com/watch?v=ID, youtu.be/ID, youtube.com/shorts/ID → a reliable thumbnail URL. */
function youtubeThumbnail(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null;
}

function extractJsonArray(text: string): unknown {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    return [];
  }
}

const SENTIMENTS: MarketSentiment[] = ["positive", "neutral", "negative"];

export type ScanDepth = "broad" | "deep";

/**
 * Best-effort social listening: uses hosted web search (not an official
 * platform API) to find recent public posts matching a natural-language
 * search subject (a keyword mention, or a specific account's recent posts)
 * on one platform. Metadata the model can't verify from the page (exact
 * engagement counts, avatars) is left null rather than guessed.
 *
 * `depth: "deep"` explicitly asks for a different slice of results than the
 * obvious top hits — used for a follow-up pass so repeated scans surface new
 * posts instead of the same handful of most-viral ones every time.
 */
async function scanSubjectOnPlatform(subject: string, platform: MarketPlatform, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  const depthClause =
    depth === "deep"
      ? " Specifically look past the first page of obvious top results — check older posts, smaller/less-viral accounts, and secondary search phrasings. Avoid returning posts that are typically the single most-shared or most-cited result for this topic; prioritize variety and coverage over popularity."
      : " Include a mix of highly-engaged and lower-engagement posts — don't only return the single most popular/viral result.";

  // Search with a real engine first. Asking the model to produce result URLs
  // itself does not work on the default provider (Vertex): Google Search
  // grounding silently drops the `site:` restriction, returns zero sources,
  // and the model then answers `[]` — which is exactly why every keyword
  // reported no mentions. The model now only ever sees URLs a search engine
  // actually returned, and its job is narrowed to structuring them.
  const results = await webSearchResults(`${PLATFORM_SITE[platform]} posts ${subject}`, 50, {
    domains: PLATFORM_DOMAINS[platform],
  });
  if (results.length === 0) {
    // X and LinkedIn block search engines from indexing post content, so
    // Google-backed discovery returns nothing for them however the query is
    // phrased (measured: zero x.com sources across every phrasing tried).
    // That is a platform limitation, not a transient miss — say so, so it
    // does not read as "nobody is talking about you".
    if (UNINDEXED_PLATFORMS.has(platform)) {
      throw new Error(
        `${PLATFORM_SITE[platform]} does not allow search engines to index post content, so it cannot be scanned this way.`
      );
    }
    return [];
  }

  const sources = results
    .map((r, i) => `${i + 1}. ${r.url}\n   title: ${r.title}\n   snippet: ${r.snippet}`)
    .join("\n");

  const prompt = `Below are real ${PLATFORM_SITE[platform]} search results for posts ${subject}.${depthClause}

SEARCH RESULTS:
${sources}

Turn these into structured records. Use ONLY the URLs listed above, exactly as written — do not add, invent, alter, or recall any other URL.

Return ONLY a JSON array (no markdown fences, no commentary) of objects:
[{
  "url": string (the direct post/thread/video URL),
  "authorName": string | null,
  "authorHandle": string | null (${AUTHOR_GUIDANCE[platform]}),
  "content": string (the post text, or video title + description snippet, max 600 chars),
  "postedAt": string | null (ISO 8601 date if known),
  "authorAvatarUrl": string | null (the poster's profile picture image URL, if visible on the page),
  "mediaUrl": string | null (a direct image/thumbnail URL attached to the post — a photo, video thumbnail, or card image — if any),
  "sentiment": "positive" | "neutral" | "negative" (the tone of the post itself, your best judgment),
  "engagement": { "likes": number|null, "comments": number|null, "shares": number|null, "views": number|null },
  "comments": [{ "author": string|null, "content": string }] (up to 3 top comments/replies if visible, else [])
}]

Include one object per search result above. Never invent posts, authors, or numbers — use null for anything the title and snippet don't tell you. If none of the results are usable posts, return [].`;

  // No search tool here: the searching is already done, and Vertex rejects
  // JSON response formatting outright when a search tool is attached
  // ("controlled generation is not supported with Search tool"). The output
  // cap is generous because 50 records of this shape is a lot of JSON, and a
  // truncated array parses as zero mentions.
  const { ai, model } = await getAiClient();
  const response = await ai.responses.create({
    model,
    input: prompt,
    max_output_tokens: 32768,
  });

  {

    const parsed = extractJsonArray(response.output_text ?? "[]");
    if (!Array.isArray(parsed)) return [];

    const mentions = parsed.flatMap((raw): DiscoveredMention[] => {
      if (!raw || typeof raw !== "object") return [];
      const o = raw as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url.trim() : "";
      const content = typeof o.content === "string" ? o.content.trim().slice(0, 2000) : "";
      if (!url || !content) return [];
      try {
        new URL(url);
      } catch {
        return [];
      }

      const engagementRaw = (o.engagement ?? {}) as Record<string, unknown>;
      const engagement: MarketEngagement = {};
      for (const key of ["likes", "comments", "shares", "views"] as const) {
        const value = engagementRaw[key];
        if (typeof value === "number" && Number.isFinite(value)) engagement[key] = value;
      }

      const comments: MarketComment[] = Array.isArray(o.comments)
        ? o.comments
            .flatMap((c): MarketComment[] => {
              if (!c || typeof c !== "object") return [];
              const co = c as Record<string, unknown>;
              const commentContent = typeof co.content === "string" ? co.content.trim().slice(0, 500) : "";
              if (!commentContent) return [];
              return [{ author: typeof co.author === "string" ? co.author.trim().slice(0, 120) : null, content: commentContent }];
            })
            .slice(0, 3)
        : [];

      const rawMediaUrl = typeof o.mediaUrl === "string" ? o.mediaUrl.trim() : "";
      const mediaUrl = platform === "youtube" ? youtubeThumbnail(url) ?? (rawMediaUrl || null) : rawMediaUrl || null;
      const rawAvatarUrl = typeof o.authorAvatarUrl === "string" ? o.authorAvatarUrl.trim() : "";
      const sentiment = typeof o.sentiment === "string" && SENTIMENTS.includes(o.sentiment as MarketSentiment) ? (o.sentiment as MarketSentiment) : null;

      let authorHandle = typeof o.authorHandle === "string" ? o.authorHandle.trim().slice(0, 160) || null : null;
      // Guard against the model substituting the subreddit for the poster despite instructions.
      if (platform === "reddit" && authorHandle && /^\/?r\//i.test(authorHandle)) authorHandle = null;

      return [
        {
          platform,
          url,
          authorName: typeof o.authorName === "string" ? o.authorName.trim().slice(0, 160) || null : null,
          authorHandle,
          authorAvatarUrl: rawAvatarUrl || null,
          mediaUrl,
          content,
          postedAt: typeof o.postedAt === "string" && !Number.isNaN(Date.parse(o.postedAt)) ? new Date(o.postedAt).toISOString() : null,
          engagement,
          comments,
          sentiment,
        },
      ];
    });

    return platform === "reddit" ? repairRedditBylines(mentions) : mentions;
  }
}

/**
 * Replaces missing Reddit bylines with real ones from each post's own feed.
 *
 * Search grounding supplies a URL but no trustworthy poster, and asking the
 * model for one produces plausible-looking usernames it cannot actually see.
 * Where the feed is unavailable, the subreddit is used as the attribution —
 * it is recoverable from the URL and is true — rather than "Unknown author".
 */
async function repairRedditBylines(mentions: DiscoveredMention[]): Promise<DiscoveredMention[]> {
  for (const mention of mentions) {
    if (mention.authorHandle) continue;

    if (!redditFeedsCoolingDown()) {
      const post = await enrichRedditPost(mention.url);
      if (post?.authorHandle) {
        mention.authorHandle = post.authorHandle;
        mention.authorName = post.authorHandle;
        if (post.content) mention.content = post.content.slice(0, 2000);
        if (post.postedAt) mention.postedAt = post.postedAt;
        if (post.comments.length > 0) mention.comments = post.comments;
        continue;
      }
    }

    const subreddit = subredditFromUrl(mention.url);
    if (subreddit) mention.authorName = subreddit;
  }
  return mentions;
}

/**
 * Turns Reddit's own feed data into mentions. Preferred over search
 * grounding for Reddit because the feed carries the real poster, body,
 * timestamp and comment authors, where grounding supplies only a URL — which
 * is why every Reddit mention used to read "Unknown author".
 */
async function redditPostsToMentions(posts: RedditPost[]): Promise<DiscoveredMention[]> {
  const mentions: DiscoveredMention[] = posts.map((post) => ({
    platform: "reddit" as const,
    url: post.url,
    authorName: post.authorHandle,
    authorHandle: post.authorHandle,
    authorAvatarUrl: null,
    mediaUrl: null,
    content: (post.content || post.title).slice(0, 2000),
    postedAt: post.postedAt,
    engagement: {},
    comments: post.comments,
    sentiment: null,
  }));

  return withSentiment(mentions);
}

/**
 * One cheap, non-grounded pass to label tone, kept separate from discovery so
 * real post data is never round-tripped through a model that might rewrite it.
 *
 * Batched: Gemini counts thinking tokens against max_output_tokens, so a
 * single prompt covering a full scan's worth of posts exhausted the cap and
 * returned nothing, leaving every mention unlabelled.
 */
const SENTIMENT_BATCH_SIZE = 20;

async function withSentiment(mentions: DiscoveredMention[]): Promise<DiscoveredMention[]> {
  if (mentions.length === 0) return mentions;

  const { ai, model } = await getAiClient();

  for (let offset = 0; offset < mentions.length; offset += SENTIMENT_BATCH_SIZE) {
    const batch = mentions.slice(offset, offset + SENTIMENT_BATCH_SIZE);
    try {
      const response = await ai.responses.create({
        model,
        input: `Classify the tone of each numbered post as "positive", "neutral" or "negative".

${batch.map((m, i) => `${i + 1}. ${m.content.slice(0, 300)}`).join("\n")}

Return ONLY a JSON array of exactly ${batch.length} strings, in order, no markdown fences.`,
        max_output_tokens: 8192,
      });
      const parsed = extractJsonArray(response.output_text ?? "[]");
      if (Array.isArray(parsed)) {
        parsed.forEach((value, index) => {
          if (batch[index] && typeof value === "string" && SENTIMENTS.includes(value as MarketSentiment)) {
            batch[index].sentiment = value as MarketSentiment;
          }
        });
      }
    } catch (error) {
      // Tone is a nice-to-have — a real mention without it beats no mention —
      // but log it, because silently unlabelled posts look like a UI bug.
      console.warn("[market] sentiment pass failed:", error instanceof Error ? error.message : error);
    }
  }
  return mentions;
}

export async function scanKeywordOnPlatform(keyword: string, platform: MarketPlatform, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  if (platform === "reddit") {
    const posts = await searchRedditPosts(keyword, 50);
    if (posts && posts.length > 0) return redditPostsToMentions(posts);
    // Feed unavailable (rate-limited): fall through to grounding, which still
    // finds real URLs, and repair the bylines afterwards where possible.
  }
  return scanSubjectOnPlatform(`that mention "${keyword}"`, platform, depth);
}

export async function scanKeywordAllPlatforms(keyword: string, platforms: MarketPlatform[]): Promise<DiscoveredMention[]> {
  const results = await Promise.all(platforms.map((platform) => scanKeywordOnPlatform(keyword, platform)));
  return results.flat();
}

/** For a followed account: recent posts BY that handle, not just mentions of it. */
export async function scanAccountOnPlatform(handle: string, platform: MarketPlatform, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  if (platform === "reddit") {
    const posts = await redditUserPosts(handle, 50);
    if (posts && posts.length > 0) return redditPostsToMentions(posts);
  }
  return scanSubjectOnPlatform(`posted by the account "${handle}" (their own posts, not just replies to them)`, platform, depth);
}
