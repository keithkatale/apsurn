import type { DiscoveredMention } from "./types";

interface HnHit {
  objectID: string;
  title: string;
  url?: string;
  author: string;
  created_at: string;
  story_text?: string;
}

interface HnSearchResponse {
  hits?: HnHit[];
}

async function searchTag(tag: "ask_hn" | "show_hn", query: string, limit: number): Promise<DiscoveredMention[]> {
  const url = `https://hn.algolia.com/api/v1/search_by_date?tags=${tag}&query=${encodeURIComponent(query)}&hitsPerPage=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = (await res.json()) as HnSearchResponse;
  const mentions: DiscoveredMention[] = [];
  for (const hit of data.hits ?? []) {
    const itemUrl = tag === "ask_hn" || !hit.url ? `https://news.ycombinator.com/item?id=${hit.objectID}` : hit.url;
    const body = (hit.story_text || hit.title || "").trim();
    if (!itemUrl || !body) continue;
    mentions.push({
      platform: "hackernews",
      url: itemUrl,
      authorName: hit.author || null,
      authorHandle: hit.author || null,
      authorAvatarUrl: null,
      mediaUrl: null,
      content: `${hit.title}\n\n${body}`.slice(0, 2000),
      postedAt: hit.created_at || null,
      engagement: {},
      comments: [],
      sentiment: null,
    });
  }
  return mentions;
}

/** Ask HN and Show HN threads. Keyless, and aimed at people talking, not company directories. */
export async function searchHackerNewsConversations(keywords: string[], limit: number): Promise<DiscoveredMention[]> {
  const query = keywords.slice(0, 2).join(" ") || "alternative to";
  const cap = Math.min(20, Math.max(4, limit));
  try {
    const [asks, shows] = await Promise.all([
      searchTag("ask_hn", query, cap).catch(() => []),
      searchTag("show_hn", keywords[0] ?? "", Math.ceil(cap / 2)).catch(() => []),
    ]);
    const seen = new Set<string>();
    const out: DiscoveredMention[] = [];
    for (const mention of [...asks, ...shows]) {
      if (seen.has(mention.url)) continue;
      seen.add(mention.url);
      out.push(mention);
      if (out.length >= cap) break;
    }
    return out;
  } catch (error) {
    console.warn("[radar] hacker news scan failed:", error instanceof Error ? error.message : error);
    return [];
  }
}
