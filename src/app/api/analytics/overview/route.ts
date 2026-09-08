import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnalyticsUser, siteFilterOrError, unauthorized } from "@/lib/analytics/access";
import { parseAnalyticsRange, rangeWindow } from "@/lib/analytics/range";

export async function GET(request: NextRequest) {
  const userId = await requireAnalyticsUser();
  if (!userId) return unauthorized();
  const range = parseAnalyticsRange(request.nextUrl.searchParams.get("range"));
  const siteId = request.nextUrl.searchParams.get("siteId");
  const filtered = await siteFilterOrError(userId, siteId);
  if ("error" in filtered) return filtered.error;
  if (filtered.siteIds.length === 0) {
    return NextResponse.json({ visitors: 0, pageViews: 0, bounceRate: 0, avgSessionTime: 0 });
  }

  const { start } = rangeWindow(range);
  const db = createAdminClient();
  const [{ count: pageViews, error: pvError }, { data: sessions, error: sessionsError }] = await Promise.all([
    db.from("analytics_page_views").select("id", { count: "exact", head: true }).gte("timestamp", start.toISOString()).in("site_id", filtered.siteIds),
    db.from("analytics_sessions").select("visitor_id, duration, page_views").gte("started_at", start.toISOString()).in("site_id", filtered.siteIds),
  ]);
  if (pvError || sessionsError) {
    return NextResponse.json({ error: pvError?.message ?? sessionsError?.message }, { status: 500 });
  }

  const uniqueVisitors = new Set((sessions ?? []).map((session) => session.visitor_id)).size;
  const totalSessions = sessions?.length ?? 0;
  const bouncedSessions = (sessions ?? []).filter((session) => session.page_views === 1).length;
  const totalDuration = (sessions ?? []).reduce((sum, session) => sum + (session.duration ?? 0), 0);

  return NextResponse.json({
    visitors: uniqueVisitors,
    pageViews: pageViews ?? 0,
    bounceRate: totalSessions > 0 ? Math.round((bouncedSessions / totalSessions) * 1000) / 10 : 0,
    avgSessionTime: totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0,
  });
}
