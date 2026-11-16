/**
 * Keyless Reddit buying-intent scanner.
 * Uses targeted search (via DuckDuckGo site:reddit.com) to find live Reddit
 * discussions where users request software recommendations, complain about
 * competitors, or ask for alternatives. Bypasses Reddit 403 blocks with zero API keys.
 */
import { duckDuckGoSearch } from "@/lib/search/duckduckgo";
import type { DiscoveredSignal } from "./types";

const TARGET_SUBREDDITS = ["SaaS", "startups", "sales", "entrepreneur", "devops", "smallbusiness"];

function extractRedditMetadata(url: string, title: string, snippet: string): { author: string | null; subreddit: string } {
  const subMatch = /reddit\.com\/r\/([a-zA-Z0-9_]+)/i.exec(url);
  const subreddit = subMatch ? subMatch[1] : "SaaS";
  const authorMatch = /u\/([a-zA-Z0-9_-]+)/i.exec(`${title} ${snippet}`);
  return { author: authorMatch ? `u/${authorMatch[1]}` : null, subreddit };
}

function classifyIntent(text: string, competitors: string[] = []): { score: number; type: DiscoveredSignal["signalType"] } {
  const lower = text.toLowerCase();
  for (const comp of competitors) {
    if (comp && lower.includes(comp.toLowerCase())) {
      if (lower.includes("alternative") || lower.includes("switch") || lower.includes("hate") || lower.includes("expensive") || lower.includes("replace") || lower.includes("vs")) {
        return { score: 95, type: "competitor_churn" };
      }
    }
  }
  if (lower.includes("looking for tool") || lower.includes("recommend a tool") || lower.includes("recommend software") || lower.includes("alternative to") || lower.includes("any tool for") || lower.includes("best software to") || lower.includes("suggest a tool")) {
    return { score: 90, type: "tool_recommendation" };
  }
  if (lower.includes("struggling with") || lower.includes("how do you handle") || lower.includes("pain point") || lower.includes("too much manual")) {
    return { score: 80, type: "workflow_pain" };
  }
  return { score: 75, type: "tool_recommendation" };
}

export async function scanRedditIntent(
  queries: string[],
  options: { competitors?: string[]; limit?: number } = {},
): Promise<DiscoveredSignal[]> {
  const limit = Math.min(100, Math.max(5, options.limit ?? 30));
  const competitors = options.competitors ?? [];
  const signals: DiscoveredSignal[] = [];
  const seenUrls = new Set<string>();

  // Build targeted intent queries
  const intentPhrases = [
    ...queries.map((q) => `"${q}" alternative`),
    ...queries.map((q) => `recommend tool "${q}"`),
    ...competitors.map((c) => `"${c}" alternative OR "switch from ${c}"`),
  ].slice(0, 4);

  const searchPromises = intentPhrases.map((phrase) =>
    duckDuckGoSearch(`site:reddit.com (${TARGET_SUBREDDITS.map((s) => `r/${s}`).join(" OR ")}) ${phrase}`, { limit: 6 }).catch(() => [])
  );

  const batchResults = await Promise.all(searchPromises);

  for (const results of batchResults) {
    for (const item of results) {
      if (!item.url.includes("reddit.com/r/") || seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);

      const fullText = `${item.title}\n${item.snippet}`;
      const { score, type } = classifyIntent(fullText, competitors);
      const { author, subreddit } = extractRedditMetadata(item.url, item.title, item.snippet);

      // Clean up Reddit title formatting (e.g. "Title : r/SaaS - Reddit")
      const cleanTitle = item.title.replace(/\s*:\s*r\/[a-zA-Z0-9_]+\s*-\s*Reddit/gi, "").trim();

      signals.push({
        id: `reddit_${Math.random().toString(36).slice(2, 9)}`,
        companyName: `r/${subreddit} Buyer`,
        domain: null,
        contactName: author,
        contactTitle: `r/${subreddit} Community Member`,
        title: cleanTitle,
        snippet: item.snippet.slice(0, 300),
        sourceUrl: item.url,
        platform: "reddit",
        signalType: type,
        intentScore: score,
        detectedAt: new Date().toISOString(),
        suggestedAngle: `Address buying intent on r/${subreddit}: "${cleanTitle.slice(0, 70)}"`,
      });

      if (signals.length >= limit) break;
    }
    if (signals.length >= limit) break;
  }

  return signals;
}
