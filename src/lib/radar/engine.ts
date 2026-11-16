/** Radar engine: run due sources, dedupe, score, qualify, and persist signals. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isBackedOff, sourceIsDue, dedupeSignals, eventScore, needsTextJudgement, nextRunAt } from "./core.ts";
import { ALL_SOURCES } from "./sources.ts";
import type { RadarSignalType, RawSignal, SourceStateRow, WatchConfig } from "./types.ts";

export interface RadarContext {
  db: SupabaseClient;
  userId: string;
  companyId: string;
  watch: WatchConfig;
}

interface WatchRow {
  id: string;
  sources: string[];
  keywords: string[];
  competitors: string[];
  geographies: string[];
  forums: string[];
  ats_boards: Array<{ ats: "greenhouse" | "lever" | "ashby"; slug: string }>;
  min_score: number;
  auto_source: boolean;
  daily_auto_cap: number;
  cadence_minutes: number;
  next_run_at: string;
}

export async function loadWatch(db: SupabaseClient, userId: string, companyId: string): Promise<WatchRow | null> {
  const { data, error } = await db.from("radar_watches").select("*").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as WatchRow | null) ?? null;
}

async function loadSourceStates(db: SupabaseClient, sourceIds: string[]): Promise<Map<string, SourceStateRow>> {
  const { data, error } = await db.from("radar_source_state").select("*").in("source", sourceIds);
  if (error) throw new Error(error.message);
  const out = new Map<string, SourceStateRow>();
  for (const row of (data ?? []) as SourceStateRow[]) {
    out.set(row.source, row);
  }
  return out;
}

async function runSourcesForWatch(ctx: RadarContext, now: number): Promise<RawSignal[]> {
  const sources = ALL_SOURCES.filter((s) => ctx.watch.sources.includes(s.id));
  const states = await loadSourceStates(ctx.db, sources.map((s) => s.id));
  const signals: RawSignal[] = [];

  for (const source of sources) {
    const state = states.get(source.id) ?? { source: source.id, backoff_until: null, consecutive_failures: 0, last_ok_at: null, last_error: null };
    const unavailable = source.available(ctx.watch);
    if (unavailable) {
      console.warn(`[radar] ${source.id} not available: ${unavailable}`);
      continue;
    }
    if (isBackedOff(state.backoff_until, now)) {
      console.warn(`[radar] ${source.id} backed off until ${state.backoff_until}`);
      continue;
    }
    if (!sourceIsDue(state.last_ok_at, source.minIntervalMs, now)) {
      continue;
    }

    try {
      const fetched = await source.fetch({
        watch: ctx.watch,
        limit: 50,
        signal: AbortSignal.timeout(30_000),
      });
      signals.push(...fetched);
      await ctx.db.from("radar_source_state").upsert({ source: source.id, last_ok_at: new Date().toISOString(), consecutive_failures: 0, backoff_until: null, updated_at: new Date().toISOString() });
    } catch (error) {
      const nextBackoff = new Date(now + (error instanceof Error && error.name === "AbortError" ? 60_000 : 300_000)).toISOString();
      await ctx.db.from("radar_source_state").upsert({
        source: source.id,
        consecutive_failures: state.consecutive_failures + 1,
        backoff_until: nextBackoff,
        last_error: error instanceof Error ? error.message : String(error),
        updated_at: new Date().toISOString(),
      });
      console.warn(`[radar] ${source.id} failed:`, error instanceof Error ? error.message : error);
    }
  }

  return signals;
}

export async function scoreRawSignals(signals: RawSignal[], now: number): Promise<Array<RawSignal & { score: number }>> {
  return signals.map((signal) => ({
    ...signal,
    score: needsTextJudgement(signal.type as RadarSignalType) ? 0 : eventScore(signal.type as RadarSignalType, signal.eventAt, now),
  }));
}

export async function upsertSignals(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  watchId: string,
  signals: Array<RawSignal & { score: number }>,
  minScore: number,
): Promise<number> {
  if (!signals.length) return 0;
  const now = new Date().toISOString();
  const rows = signals
    .filter((s) => s.score >= minScore)
    .map((s) => ({
      user_id: userId,
      company_id: companyId,
      watch_id: watchId,
      source: s.source,
      signal_type: s.type,
      entity_name: s.entityName,
      domain: s.domain,
      url: s.url,
      title: s.title,
      excerpt: s.excerpt,
      author: s.author,
      event_at: s.eventAt,
      score: s.score,
      status: "new",
      dedupe_key: `${s.source}|${new URL(s.url).hostname || s.url}`,
      meta: s.meta ?? {},
      first_seen_at: now,
      last_seen_at: now,
    }));

  const { error, count } = await db.from("radar_signals").upsert(rows, { onConflict: "user_id,dedupe_key" });
  if (error) {
    console.warn("[radar] upsert failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function runRadarForWatch(ctx: RadarContext): Promise<{ signals: number; scored: number; persisted: number }> {
  const now = Date.now();
  const watch = await loadWatch(ctx.db, ctx.userId, ctx.companyId);
  if (!watch) return { signals: 0, scored: 0, persisted: 0 };

  ctx.watch = {
    keywords: watch.keywords,
    competitors: watch.competitors,
    geographies: watch.geographies,
    forums: watch.forums,
    atsBoards: watch.ats_boards,
  };

  const signals = dedupeSignals(await runSourcesForWatch(ctx, now));
  const scored = await scoreRawSignals(signals, now);
  const persisted = await upsertSignals(ctx.db, ctx.userId, ctx.companyId, watch.id, scored, watch.min_score);

  await ctx.db.from("radar_watches").update({ last_run_at: new Date().toISOString(), next_run_at: nextRunAt(watch.cadence_minutes, now) }).eq("id", watch.id);

  return { signals: signals.length, scored: scored.length, persisted };
}
