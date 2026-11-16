import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketPlatform, RadarIntent } from "./types";

export interface MentionDraft {
  keywordId: string | null;
  platform: MarketPlatform;
  url: string;
  authorName: string | null;
  authorHandle: string | null;
  content: string;
  postedAt: string | null;
  qualifyScore: number;
  qualifyReason: string;
  intent: RadarIntent;
  suggestedOpener: string;
}

interface ExistingMention {
  url: string;
  status: string | null;
  is_saved: boolean | null;
}

function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url.trim());
    parsed.hash = "";
    if (/reddit\.com$/i.test(parsed.hostname)) parsed.search = "";
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
    return parsed.toString();
  } catch {
    return url.trim();
  }
}

/**
 * Inserts new conversations and refreshes last_seen_at on ones we already
 * stored. Saved and dismissed rows are not rewritten.
 */
export async function upsertRadarMentions(db: SupabaseClient, companyId: string, drafts: MentionDraft[]): Promise<number> {
  const now = new Date().toISOString();
  const byUrl = new Map<string, MentionDraft>();
  for (const draft of drafts) {
    const url = canonicalUrl(draft.url);
    const content = draft.content.trim();
    if (!url || !content) continue;
    if (!byUrl.has(url)) byUrl.set(url, { ...draft, url, content: content.slice(0, 2000) });
  }
  const mentions = [...byUrl.values()];
  if (mentions.length === 0) return 0;

  const urls = mentions.map((mention) => mention.url);
  const { data: existing, error: readError } = await db
    .from("market_mentions")
    .select("url, status, is_saved")
    .eq("company_id", companyId)
    .in("url", urls);
  if (readError) throw new Error(readError.message);

  const protectedUrls = new Set(
    ((existing ?? []) as ExistingMention[])
      .filter((row) => row.status === "saved" || row.status === "dismissed" || row.is_saved)
      .map((row) => row.url),
  );
  if (protectedUrls.size > 0) {
    await db.from("market_mentions").update({ last_seen_at: now }).eq("company_id", companyId).in("url", [...protectedUrls]);
  }

  const fresh = mentions.filter((mention) => !protectedUrls.has(mention.url));
  if (fresh.length === 0) return 0;

  const rows = fresh.map((mention) => ({
    company_id: companyId,
    keyword_id: mention.keywordId,
    platform: mention.platform,
    url: mention.url,
    author_name: mention.authorName,
    author_handle: mention.authorHandle,
    content: mention.content,
    posted_at: mention.postedAt,
    engagement: {},
    comments: [],
    qualify_score: mention.qualifyScore,
    qualify_reason: mention.qualifyReason,
    intent: mention.intent,
    suggested_opener: mention.suggestedOpener,
    status: "new",
    last_seen_at: now,
  }));

  const { error } = await db.from("market_mentions").upsert(rows, { onConflict: "company_id,url" });
  if (error) throw new Error(error.message);
  return fresh.length;
}

export async function stampKeywordsScanned(db: SupabaseClient, companyId: string, keywordIds: string[]): Promise<void> {
  if (keywordIds.length === 0) return;
  const { error } = await db
    .from("market_keywords")
    .update({ last_scanned_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .in("id", keywordIds);
  if (error) console.warn("[radar] could not stamp keywords:", error.message);
}
