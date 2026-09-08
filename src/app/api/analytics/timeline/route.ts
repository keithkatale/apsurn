import { NextRequest, NextResponse } from "next/server";
import { startOfDay, startOfHour } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnalyticsUser, siteFilterOrError, unauthorized } from "@/lib/analytics/access";
import { fillTimeline, parseAnalyticsRange, rangeWindow } from "@/lib/analytics/range";

export async function GET(request: NextRequest) {
  const userId = await requireAnalyticsUser();
  if (!userId) return unauthorized();
  const range = parseAnalyticsRange(request.nextUrl.searchParams.get("range"));
  const siteId = request.nextUrl.searchParams.get("siteId");
  const filtered = await siteFilterOrError(userId, siteId);
  if ("error" in filtered) return filtered.error;
  if (filtered.siteIds.length === 0) return NextResponse.json([]);

  const { start, end, interval } = rangeWindow(range);
  const db = createAdminClient();
  const { data, error } = await db
    .from("analytics_page_views")
    .select("timestamp")
    .gte("timestamp", start.toISOString())
    .lte("timestamp", end.toISOString())
    .in("site_id", filtered.siteIds)
    .order("timestamp", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const date = new Date(row.timestamp);
    const key = (interval === "hour" ? startOfHour(date) : startOfDay(date)).toISOString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return NextResponse.json(fillTimeline(counts, range));
}
