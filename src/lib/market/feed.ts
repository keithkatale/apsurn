import type { SupabaseClient } from "@supabase/supabase-js";
import { seedListeningKeywords } from "./suggest";
import { isScanFresh } from "./scan-run";
import type { MarketPlatform, MentionStatus, RadarFeedPayload, RadarIntent, RadarKeyword, RadarMentionCard } from "./types";

interface KeywordDbRow {
  id: string;
  keyword: string;
  intent: RadarIntent | null;
  is_active: boolean;
  last_scanned_at: string | null;
}

interface MentionDbRow {
  id: string;
  platform: MarketPlatform;
  url: string;
  author_name: string | null;
  author_handle: string | null;
  content: string;
  posted_at: string | null;
  keyword_id: string | null;
  qualify_score: number | null;
  qualify_reason: string | null;
  intent: RadarIntent | null;
  suggested_opener: string | null;
  status: MentionStatus;
}

function keywordFrom(row: KeywordDbRow): RadarKeyword {
  return {
    id: row.id,
    keyword: row.keyword,
    intent: row.intent,
    isActive: row.is_active,
    lastScannedAt: row.last_scanned_at,
  };
}

const SCHEMA_HINT = "Radar needs a database update. Run supabase/migrations/0039_radar_feed.sql in the Supabase SQL editor, then reload.";

function missingColumn(message: string | undefined): boolean {
  return /does not exist|schema cache|could not find the/i.test(message ?? "");
}

/** Keywords, qualified conversations, and whether a background scan is still fresh. Seeds phrases when the company has none. */
export async function loadRadarFeed(db: SupabaseClient, userId: string, companyId: string): Promise<RadarFeedPayload> {
  const empty: RadarFeedPayload = { keywords: [], mentions: [], lastScannedAt: null, dismissedCount: 0, fresh: true, schemaError: null };
  const { count, error: countError } = await db.from("market_keywords").select("id", { count: "exact", head: true }).eq("company_id", companyId);
  if (countError) {
    if (missingColumn(countError.message)) return { ...empty, schemaError: SCHEMA_HINT };
    throw new Error(countError.message);
  }
  if ((count ?? 0) === 0) {
    await seedListeningKeywords(db, userId, companyId).catch((error) => {
      console.warn("[radar] seed on open failed:", error instanceof Error ? error.message : error);
    });
  }

  const [keywordsResult, mentionsResult, dismissedResult] = await Promise.all([
    db.from("market_keywords").select("id, keyword, intent, is_active, last_scanned_at").eq("company_id", companyId).order("created_at", { ascending: true }),
    db
      .from("market_mentions")
      .select("id, platform, url, author_name, author_handle, content, posted_at, keyword_id, qualify_score, qualify_reason, intent, suggested_opener, status")
      .eq("company_id", companyId)
      .eq("status", "new")
      .order("qualify_score", { ascending: false })
      .limit(60),
    db.from("market_mentions").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "dismissed"),
  ]);

  const queryError = keywordsResult.error ?? mentionsResult.error ?? dismissedResult.error;
  if (queryError) {
    if (missingColumn(queryError.message)) return { ...empty, schemaError: SCHEMA_HINT };
    throw new Error(queryError.message);
  }

  const keywords = ((keywordsResult.data ?? []) as KeywordDbRow[]).map(keywordFrom);
  const byId = new Map(keywords.map((keyword) => [keyword.id, keyword.keyword]));
  const mentions = ((mentionsResult.data ?? []) as MentionDbRow[])
    .map((row): RadarMentionCard => ({
      id: row.id,
      platform: row.platform,
      url: row.url,
      authorName: row.author_name,
      authorHandle: row.author_handle,
      content: row.content,
      postedAt: row.posted_at,
      keyword: row.keyword_id ? (byId.get(row.keyword_id) ?? null) : null,
      qualifyScore: row.qualify_score,
      qualifyReason: row.qualify_reason,
      intent: row.intent,
      suggestedOpener: row.suggested_opener,
    }))
    .sort((a, b) => {
      const score = (b.qualifyScore ?? 0) - (a.qualifyScore ?? 0);
      if (score !== 0) return score;
      return (b.postedAt ?? "").localeCompare(a.postedAt ?? "");
    });

  const lastScannedAt = keywords.reduce<string | null>((latest, keyword) => {
    if (!keyword.lastScannedAt) return latest;
    if (!latest || keyword.lastScannedAt > latest) return keyword.lastScannedAt;
    return latest;
  }, null);

  return {
    keywords,
    mentions,
    lastScannedAt,
    dismissedCount: dismissedResult.count ?? 0,
    fresh: isScanFresh(lastScannedAt),
    schemaError: null,
  };
}
