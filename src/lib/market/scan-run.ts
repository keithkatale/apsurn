import type { SupabaseClient } from "@supabase/supabase-js";
import { scanRedditIntent } from "@/lib/prospecting/radar/reddit-radar";
import type { DiscoveredSignal } from "@/lib/prospecting/radar/types";
import { searchHackerNewsConversations } from "./hackernews";
import { stampKeywordsScanned, upsertRadarMentions, type MentionDraft } from "./mutations";
import { qualifyMentions, type QualifyContext } from "./qualify";
import { heuristicQualify } from "./qualify-core";
import { searchLinkedInMentions } from "./linkedin";
import { searchRedditMentions } from "./reddit";
import { searchTwitterMentions } from "./twitter";
import type { DiscoveredMention, MarketPlatform, RadarIntent, ScanDepth } from "./types";

const STALE_MS = 6 * 60 * 60 * 1000;
const BROAD_KEYWORDS = 4;
const DEEP_KEYWORDS = 8;

export interface RadarScanRequest {
  userId: string;
  companyId: string;
  depth: ScanDepth;
  /** Shallow scans skip when this company was scanned in the last 6 hours. */
  skipIfFresh?: boolean;
}

export interface RadarScanResult {
  skipped: boolean;
  reason?: "fresh" | "in_progress" | "no_keywords";
  scanned: number;
  kept: number;
  lastScannedAt: string | null;
}

interface KeywordRow {
  id: string;
  keyword: string;
  intent: RadarIntent | null;
}

interface RawHit extends DiscoveredMention {
  keywordId: string | null;
}

const inflight = new Set<string>();

export function isScanFresh(lastScannedAt: string | null, now = Date.now()): boolean {
  if (!lastScannedAt) return false;
  const then = new Date(lastScannedAt).getTime();
  return Number.isFinite(then) && now - then < STALE_MS;
}

async function latestScan(db: SupabaseClient, companyId: string): Promise<string | null> {
  const { data } = await db
    .from("market_keywords")
    .select("last_scanned_at")
    .eq("company_id", companyId)
    .not("last_scanned_at", "is", null)
    .order("last_scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.last_scanned_at as string | null) ?? null;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index]);
    }
  }
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

function matchKeyword(text: string, keywords: KeywordRow[]): KeywordRow | null {
  const lower = text.toLowerCase();
  return keywords.find((keyword) => lower.includes(keyword.keyword.toLowerCase())) ?? null;
}

async function searchPlatform(platform: MarketPlatform, keyword: string, depth: ScanDepth): Promise<DiscoveredMention[]> {
  if (platform === "reddit") return searchRedditMentions(keyword, depth);
  if (platform === "twitter") return searchTwitterMentions(keyword, depth);
  if (platform === "linkedin") return searchLinkedInMentions(keyword, depth);
  return [];
}

function fromSignal(signal: DiscoveredSignal, keywords: KeywordRow[]): RawHit | null {
  if (signal.platform !== "reddit" && signal.platform !== "hacker_news") return null;
  const content = `${signal.title}\n\n${signal.snippet}`.slice(0, 2000);
  const matched = matchKeyword(content, keywords);
  return {
    platform: signal.platform === "hacker_news" ? "hackernews" : "reddit",
    url: signal.sourceUrl,
    authorName: signal.contactName,
    authorHandle: signal.contactName,
    authorAvatarUrl: null,
    mediaUrl: null,
    content,
    postedAt: signal.detectedAt,
    engagement: {},
    comments: [],
    sentiment: null,
    keywordId: matched?.id ?? null,
  };
}

async function loadContext(db: SupabaseClient, companyId: string): Promise<QualifyContext> {
  const { data: bp } = await db
    .from("company_blueprints")
    .select("icp, personas, value_prop, product_summary, competitors")
    .eq("company_id", companyId)
    .maybeSingle();
  return {
    productSummary: bp?.product_summary ?? null,
    valueProp: bp?.value_prop ?? null,
    industries: bp?.icp?.industries ?? [],
    personaTitles: (bp?.personas ?? []).map((persona: { title?: string }) => persona.title).filter(Boolean),
    competitors: bp?.competitors ?? [],
  };
}

async function executeRadarScan(db: SupabaseClient, request: RadarScanRequest): Promise<RadarScanResult> {
  const { data: keywordRows, error } = await db
    .from("market_keywords")
    .select("id, keyword, intent")
    .eq("company_id", request.companyId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(request.depth === "deep" ? DEEP_KEYWORDS : BROAD_KEYWORDS);
  if (error) throw new Error(error.message);
  const keywords = (keywordRows ?? []) as KeywordRow[];
  if (keywords.length === 0) {
    return { skipped: true, reason: "no_keywords", scanned: 0, kept: 0, lastScannedAt: await latestScan(db, request.companyId) };
  }

  const context = await loadContext(db, request.companyId);
  const phrases = keywords.map((keyword) => keyword.keyword);
  const jobs = keywords.flatMap((keyword) =>
    (["reddit", "twitter", "linkedin"] as const).map((platform) => ({ keyword, platform })),
  );
  const communityLimit = request.depth === "deep" ? 16 : 8;

  const [platformHits, redditIntent, hackerNews] = await Promise.all([
    mapPool(jobs, 4, async (job) => {
      try {
        const mentions = await searchPlatform(job.platform, job.keyword.keyword, request.depth);
        return mentions.map((mention): RawHit => ({ ...mention, keywordId: job.keyword.id }));
      } catch (scanError) {
        console.warn("[radar] platform scan failed:", scanError instanceof Error ? scanError.message : scanError);
        return [];
      }
    }),
    scanRedditIntent(phrases, { competitors: context.competitors, limit: communityLimit }).catch(() => [] as DiscoveredSignal[]),
    searchHackerNewsConversations(phrases, communityLimit),
  ]);

  const seen = new Set<string>();
  const hits: RawHit[] = [];
  const push = (hit: RawHit | null) => {
    if (!hit?.url || !hit.content.trim() || seen.has(hit.url)) return;
    seen.add(hit.url);
    hits.push(hit);
  };
  for (const group of platformHits) for (const hit of group) push(hit);
  for (const signal of redditIntent) push(fromSignal(signal, keywords));
  for (const mention of hackerNews) {
    const matched = matchKeyword(mention.content, keywords);
    push({ ...mention, keywordId: matched?.id ?? keywords[0]?.id ?? null });
  }

  const candidates = hits
    .map((hit) => ({ hit, heuristic: heuristicQualify(hit.content, context.competitors) }))
    .filter((item) => !item.heuristic.reject)
    .sort((a, b) => b.heuristic.score - a.heuristic.score)
    .slice(0, request.depth === "deep" ? 40 : 24);

  let kept = 0;
  for (let offset = 0; offset < candidates.length; offset += 8) {
    const batch = candidates.slice(offset, offset + 8);
    const qualified = await qualifyMentions(
      context,
      batch.map((item, index) => ({
        key: String(offset + index),
        platform: item.hit.platform,
        author: item.hit.authorHandle ?? item.hit.authorName,
        content: item.hit.content,
      })),
    );
    const drafts: MentionDraft[] = [];
    qualified.forEach((verdict, index) => {
      if (verdict.reject) return;
      const hit = batch[index]?.hit;
      if (!hit) return;
      drafts.push({
        keywordId: hit.keywordId,
        platform: hit.platform,
        url: hit.url,
        authorName: hit.authorName,
        authorHandle: hit.authorHandle,
        content: hit.content,
        postedAt: hit.postedAt,
        qualifyScore: verdict.score,
        qualifyReason: verdict.reason,
        intent: verdict.intent,
        suggestedOpener: verdict.opener,
      });
    });
    if (drafts.length > 0) kept += await upsertRadarMentions(db, request.companyId, drafts);
  }

  await stampKeywordsScanned(
    db,
    request.companyId,
    keywords.map((keyword) => keyword.id),
  );
  return {
    skipped: false,
    scanned: hits.length,
    kept,
    lastScannedAt: new Date().toISOString(),
  };
}

export async function runRadarScan(db: SupabaseClient, request: RadarScanRequest): Promise<RadarScanResult> {
  if (inflight.has(request.companyId)) {
    return { skipped: true, reason: "in_progress", scanned: 0, kept: 0, lastScannedAt: await latestScan(db, request.companyId) };
  }
  inflight.add(request.companyId);
  try {
    if (request.skipIfFresh && request.depth === "broad") {
      const lastScannedAt = await latestScan(db, request.companyId);
      if (isScanFresh(lastScannedAt)) {
        return { skipped: true, reason: "fresh", scanned: 0, kept: 0, lastScannedAt };
      }
    }
    return await executeRadarScan(db, request);
  } finally {
    inflight.delete(request.companyId);
  }
}
