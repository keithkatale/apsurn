import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized, isCronAuthorized } from "@/lib/jobs/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runRadarForWatch } from "@/lib/radar/engine";

export const runtime = "nodejs";
export const maxDuration = 120;

interface WatchRow {
  id: string;
  user_id: string;
  company_id: string;
  is_active: boolean;
  next_run_at: string;
  claimed_at: string | null;
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorized();

  const db = createAdminClient();
  const now = new Date();
  const { data: due, error } = await db
    .from("radar_watches")
    .select("id, user_id, company_id, is_active, next_run_at, claimed_at")
    .eq("is_active", true)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(2);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let processed = 0;
  for (const watch of (due ?? []) as WatchRow[]) {
    try {
      const result = await runRadarForWatch({ db, userId: watch.user_id, companyId: watch.company_id, watch: { keywords: [], competitors: [], geographies: [], forums: [], atsBoards: [] } });
      processed += 1;
      console.log(`[radar-cron] watch ${watch.id}: ${result.signals} signals, ${result.persisted} persisted`);
    } catch (scanError) {
      console.warn(`[radar-cron] watch ${watch.id} failed:`, scanError instanceof Error ? scanError.message : scanError);
    }
  }

  return NextResponse.json({ watches: processed });
}
