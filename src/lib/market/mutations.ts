import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAvatarUrl } from "./avatars";
import { scanAccountOnPlatform, scanKeywordAllPlatforms, scanKeywordOnPlatform, type DiscoveredMention, type ScanDepth } from "./search";
import type { MarketAccountRow, MarketKeywordRow, MarketPlatform } from "./types";

const PLATFORM_LABEL: Record<MarketPlatform, string> = {
  twitter: "X/Twitter",
  reddit: "Reddit",
  youtube: "YouTube",
  linkedin: "LinkedIn",
};

export interface ScanProgressEvent {
  label: string;
  progress: number;
}

interface ResolvedAccount {
  id: string | null;
  avatarUrl: string | null;
}

/**
 * Upserts the author of a discovered mention into market_accounts. If
 * neither the AI search nor the existing row already has a profile picture,
 * this opportunistically fetches one via a real, keyless lookup per
 * platform (see avatars.ts) rather than relying only on what the search
 * happened to surface — avatars matter for anyone tracking a specific
 * account, so we try harder for those than for a one-off mention.
 */
async function resolveAccount(db: SupabaseClient, companyId: string, mention: DiscoveredMention): Promise<ResolvedAccount> {
  if (!mention.authorHandle) return { id: null, avatarUrl: mention.authorAvatarUrl };

  const { data: existing } = await db
    .from("market_accounts")
    .select("id, avatar_url")
    .eq("company_id", companyId)
    .eq("platform", mention.platform)
    .eq("handle", mention.authorHandle)
    .maybeSingle();

  let avatarUrl = mention.authorAvatarUrl || existing?.avatar_url || null;
  if (!avatarUrl) avatarUrl = await resolveAvatarUrl(mention.platform, mention.authorHandle);

  const { data, error } = await db
    .from("market_accounts")
    .upsert(
      {
        company_id: companyId,
        platform: mention.platform,
        handle: mention.authorHandle,
        name: mention.authorName,
        avatar_url: avatarUrl,
      },
      { onConflict: "company_id,platform,handle" }
    )
    .select("id")
    .single();

  if (error || !data) return { id: null, avatarUrl };
  return { id: data.id as string, avatarUrl };
}

function toMentionRow(companyId: string, m: DiscoveredMention, account: ResolvedAccount, keywordId: string | null) {
  return {
    keyword_id: keywordId,
    account_id: account.id,
    company_id: companyId,
    platform: m.platform,
    url: m.url,
    author_name: m.authorName,
    author_handle: m.authorHandle,
    author_avatar_url: account.avatarUrl,
    media_url: m.mediaUrl,
    content: m.content,
    posted_at: m.postedAt,
    engagement: m.engagement,
    comments: m.comments,
    sentiment: m.sentiment,
  };
}

/**
 * Scans a single keyword across its configured platforms. Mentions are
 * ephemeral: any previously-found, unsaved mentions for this keyword are
 * cleared before the fresh results are inserted, so stale content doesn't
 * accumulate forever — only mentions the user has explicitly saved persist
 * across re-scans.
 */
export async function scanKeyword(db: SupabaseClient, companyId: string, keyword: MarketKeywordRow): Promise<number> {
  const found = await scanKeywordAllPlatforms(keyword.keyword, keyword.platforms);

  await db.from("market_mentions").delete().eq("keyword_id", keyword.id).eq("is_saved", false);

  if (found.length === 0) {
    await db.from("market_keywords").update({ last_scanned_at: new Date().toISOString() }).eq("id", keyword.id);
    return 0;
  }

  const rows = await Promise.all(
    found.map(async (m) => toMentionRow(companyId, m, await resolveAccount(db, companyId, m), keyword.id))
  );

  const { data, error } = await db
    .from("market_mentions")
    .upsert(rows, { onConflict: "company_id,url", ignoreDuplicates: true })
    .select("id");

  await db.from("market_keywords").update({ last_scanned_at: new Date().toISOString() }).eq("id", keyword.id);

  if (error) {
    console.error(`[market] failed to save mentions for "${keyword.keyword}": ${error.message}`);
    return 0;
  }

  return data?.length ?? 0;
}

export async function scanAllActiveKeywords(db: SupabaseClient, companyId: string): Promise<{ scanned: number; saved: number }> {
  const { data: keywords } = await db
    .from("market_keywords")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true);

  if (!keywords || keywords.length === 0) return { scanned: 0, saved: 0 };

  const results = await Promise.all((keywords as MarketKeywordRow[]).map((keyword) => scanKeyword(db, companyId, keyword)));
  return { scanned: keywords.length, saved: results.reduce((sum, n) => sum + n, 0) };
}

/**
 * Scans a followed account's own recent posts. Unlike keyword scans, this
 * accumulates as an ongoing timeline (deduped by URL) rather than clearing
 * previous results — you're building a history of that account, not
 * re-searching a topic.
 */
export async function scanAccount(db: SupabaseClient, companyId: string, account: MarketAccountRow, depth: ScanDepth = "broad"): Promise<number> {
  const found = await scanAccountOnPlatform(account.handle, account.platform, depth);

  let avatarUrl = account.avatar_url;
  if (!avatarUrl) {
    avatarUrl = await resolveAvatarUrl(account.platform, account.handle);
    if (avatarUrl) await db.from("market_accounts").update({ avatar_url: avatarUrl }).eq("id", account.id);
  }
  await db.from("market_accounts").update({ last_scanned_at: new Date().toISOString() }).eq("id", account.id);
  if (found.length === 0) return 0;

  const resolved: ResolvedAccount = { id: account.id, avatarUrl };
  const rows = found.map((m) => toMentionRow(companyId, m, resolved, null));
  const { data, error } = await db
    .from("market_mentions")
    .upsert(rows, { onConflict: "company_id,url", ignoreDuplicates: true })
    .select("id");

  if (error) {
    console.error(`[market] failed to save account posts for "${account.handle}": ${error.message}`);
    return 0;
  }
  return data?.length ?? 0;
}

export async function scanAllFollowedAccounts(db: SupabaseClient, companyId: string): Promise<{ scanned: number; saved: number }> {
  const { data: accounts } = await db
    .from("market_accounts")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_followed", true);

  if (!accounts || accounts.length === 0) return { scanned: 0, saved: 0 };

  const results = await Promise.all((accounts as MarketAccountRow[]).map((account) => scanAccount(db, companyId, account)));
  return { scanned: accounts.length, saved: results.reduce((sum, n) => sum + n, 0) };
}

async function scanKeywordPlatform(
  db: SupabaseClient,
  companyId: string,
  keyword: MarketKeywordRow,
  platform: MarketPlatform,
  depth: ScanDepth = "broad"
): Promise<number> {
  const found = await scanKeywordOnPlatform(keyword.keyword, platform, depth);
  if (found.length === 0) return 0;

  const rows = await Promise.all(
    found.map(async (m) => toMentionRow(companyId, m, await resolveAccount(db, companyId, m), keyword.id))
  );

  const { data, error } = await db
    .from("market_mentions")
    .upsert(rows, { onConflict: "company_id,url", ignoreDuplicates: true })
    .select("id");

  if (error) {
    console.error(`[market] failed to save mentions for "${keyword.keyword}" on ${platform}: ${error.message}`);
    return 0;
  }
  return data?.length ?? 0;
}

/**
 * Same work as scanAllActiveKeywords + scanAllFollowedAccounts, but reports
 * real progress as each keyword/platform (or followed account) search
 * resolves — used to drive the live scanning UI. Each unit of work is a
 * single real network call; there's no synthetic/fake progress here.
 */
export async function runMarketScanWithProgress(
  db: SupabaseClient,
  companyId: string,
  onProgress: (event: ScanProgressEvent) => void,
  platforms?: MarketPlatform[]
): Promise<{ scanned: number; saved: number; failures: string[] }> {
  const [{ data: keywords }, { data: accounts }] = await Promise.all([
    db.from("market_keywords").select("*").eq("company_id", companyId).eq("is_active", true),
    db.from("market_accounts").select("*").eq("company_id", companyId).eq("is_followed", true),
  ]);

  const platformSet = platforms && platforms.length > 0 ? new Set(platforms) : null;

  const activeKeywords = ((keywords ?? []) as MarketKeywordRow[])
    .map((k) => ({ ...k, platforms: platformSet ? k.platforms.filter((p) => platformSet.has(p)) : k.platforms }))
    .filter((k) => k.platforms.length > 0);
  const followedAccounts = ((accounts ?? []) as MarketAccountRow[]).filter((a) => !platformSet || platformSet.has(a.platform));

  if (activeKeywords.length === 0 && followedAccounts.length === 0) {
    onProgress({ label: "No keywords or followed accounts to scan for the selected platforms.", progress: 100 });
    return { scanned: 0, saved: 0, failures: [] };
  }

  onProgress({ label: "Clearing stale results before this scan…", progress: 2 });
  await Promise.all(
    activeKeywords.map((keyword) => db.from("market_mentions").delete().eq("keyword_id", keyword.id).eq("is_saved", false))
  );

  const tasks: { label: string; run: () => Promise<number>; after?: () => Promise<unknown> }[] = [];

  for (const keyword of activeKeywords) {
    for (const platform of keyword.platforms) {
      tasks.push({
        label: `Searching ${PLATFORM_LABEL[platform]} for "${keyword.keyword}"`,
        run: () => scanKeywordPlatform(db, companyId, keyword, platform),
      });
    }
  }
  for (const account of followedAccounts) {
    tasks.push({
      label: `Checking ${PLATFORM_LABEL[account.platform]} for new posts from ${account.name || account.handle}`,
      run: () => scanAccount(db, companyId, account),
    });
  }

  const total = tasks.length;
  let completed = 0;
  let savedTotal = 0;

  onProgress({ label: `Starting scan across ${total} source${total === 1 ? "" : "s"}…`, progress: 4 });

  // One broken source must not take down the whole scan, but it must also not
  // pass silently: a failure here used to be swallowed into "0 mentions",
  // which is indistinguishable from "nothing was being said about you".
  const failures: string[] = [];

  await Promise.all(
    tasks.map(async (task) => {
      onProgress({ label: `${task.label}…`, progress: Math.min(95, 5 + (completed / total) * 88) });
      try {
        const count = await task.run();
        savedTotal += count;
        completed += 1;
        onProgress({
          label: `${task.label} — ${count} new mention${count === 1 ? "" : "s"}`,
          progress: Math.min(97, 5 + (completed / total) * 88),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "scan failed";
        failures.push(`${task.label}: ${message}`);
        completed += 1;
        console.error(`[market] ${task.label} failed:`, message);
        onProgress({
          label: `${task.label} — failed: ${message}`,
          progress: Math.min(97, 5 + (completed / total) * 88),
        });
      }
    })
  );

  // Every source failing is a broken scan, not an empty one — say so.
  if (failures.length === total) {
    throw new Error(`Scan failed for all ${total} source${total === 1 ? "" : "s"}. ${failures[0]}`);
  }

  await Promise.all(activeKeywords.map((keyword) => db.from("market_keywords").update({ last_scanned_at: new Date().toISOString() }).eq("id", keyword.id)));
  await Promise.all(followedAccounts.map((account) => db.from("market_accounts").update({ last_scanned_at: new Date().toISOString() }).eq("id", account.id)));

  onProgress({
    label:
      failures.length > 0
        ? `Done — ${savedTotal} new mention${savedTotal === 1 ? "" : "s"} saved, ${failures.length} source${failures.length === 1 ? "" : "s"} failed.`
        : `Done — ${savedTotal} new mention${savedTotal === 1 ? "" : "s"} saved.`,
    progress: 100,
  });

  return { scanned: total, saved: savedTotal, failures };
}

/**
 * A follow-up pass that runs after the user-visible scan, with no progress
 * UI attached — fired as a background Inngest event so it keeps digging for
 * more content after the first batch is already on screen, without keeping
 * the request/response cycle open. Uses depth:"deep" query phrasing to
 * surface a different slice of results than the initial broad pass (older
 * posts, smaller accounts, secondary phrasings), and never deletes existing
 * mentions — it's additive on top of what the visible scan already saved.
 */
export async function runDeepMarketScan(db: SupabaseClient, companyId: string, platforms?: MarketPlatform[]): Promise<{ scanned: number; saved: number }> {
  const [{ data: keywords }, { data: accounts }] = await Promise.all([
    db.from("market_keywords").select("*").eq("company_id", companyId).eq("is_active", true),
    db.from("market_accounts").select("*").eq("company_id", companyId).eq("is_followed", true),
  ]);

  const platformSet = platforms && platforms.length > 0 ? new Set(platforms) : null;
  const activeKeywords = ((keywords ?? []) as MarketKeywordRow[])
    .map((k) => ({ ...k, platforms: platformSet ? k.platforms.filter((p) => platformSet.has(p)) : k.platforms }))
    .filter((k) => k.platforms.length > 0);
  const followedAccounts = ((accounts ?? []) as MarketAccountRow[]).filter((a) => !platformSet || platformSet.has(a.platform));

  const tasks: (() => Promise<number>)[] = [];
  for (const keyword of activeKeywords) {
    for (const platform of keyword.platforms) {
      tasks.push(() => scanKeywordPlatform(db, companyId, keyword, platform, "deep"));
    }
  }
  for (const account of followedAccounts) {
    tasks.push(() => scanAccount(db, companyId, account, "deep"));
  }

  if (tasks.length === 0) return { scanned: 0, saved: 0 };

  const results = await Promise.all(tasks.map((run) => run()));
  return { scanned: tasks.length, saved: results.reduce((sum, n) => sum + n, 0) };
}
