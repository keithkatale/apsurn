import { getAiClient } from "@/lib/ai/openai";
import { redditAccountMentions, searchRedditMentions } from "./reddit";
import { linkedInAccountMentions, searchLinkedInMentions } from "./linkedin";
import { searchTwitterMentions, twitterAccountMentions } from "./twitter";
import type { DiscoveredMention, MarketPlatform, MarketSentiment, ScanDepth } from "./types";

export type { DiscoveredMention, ScanDepth } from "./types";

const SENTIMENTS: MarketSentiment[] = ["positive", "neutral", "negative"];
const SENTIMENT_BATCH_SIZE = 20;

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

/**
 * One cheap, non-grounded pass to label tone, kept separate from discovery so
 * real post data is never round-tripped through a model that might rewrite it.
 */
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
      console.warn("[market] sentiment pass failed:", error instanceof Error ? error.message : error);
    }
  }
  return mentions;
}

export async function scanKeywordOnPlatform(keyword: string, platform: MarketPlatform, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  if (platform === "youtube") return [];
  if (platform === "reddit") return withSentiment(await searchRedditMentions(keyword, depth));
  if (platform === "twitter") return withSentiment(await searchTwitterMentions(keyword, depth));
  if (platform === "linkedin") return withSentiment(await searchLinkedInMentions(keyword, depth));
  return [];
}

export async function scanKeywordAllPlatforms(keyword: string, platforms: MarketPlatform[]): Promise<DiscoveredMention[]> {
  const results = await Promise.all(platforms.map((platform) => scanKeywordOnPlatform(keyword, platform)));
  return results.flat();
}

/** For a followed account: recent posts BY that handle, not just mentions of it. */
export async function scanAccountOnPlatform(handle: string, platform: MarketPlatform, depth: ScanDepth = "broad"): Promise<DiscoveredMention[]> {
  if (platform === "youtube") return [];
  if (platform === "reddit") return withSentiment(await redditAccountMentions(handle, depth));
  if (platform === "twitter") return withSentiment(await twitterAccountMentions(handle, depth));
  if (platform === "linkedin") return withSentiment(await linkedInAccountMentions(handle, depth));
  return [];
}
