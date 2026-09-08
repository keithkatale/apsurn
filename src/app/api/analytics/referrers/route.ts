import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnalyticsUser, siteFilterOrError, unauthorized } from "@/lib/analytics/access";
import { parseAnalyticsRange, rangeWindow } from "@/lib/analytics/range";

export async function GET(request: NextRequest) {
  const userId = await requireAnalyticsUser();
  if (!userId) return unauthorized();
  const range = parseAnalyticsRange(request.nextUrl.searchParams.get("range"));
  const type = request.nextUrl.searchParams.get("type") ?? "referrer";
  const siteId = request.nextUrl.searchParams.get("siteId");
  const filtered = await siteFilterOrError(userId, siteId);
  if ("error" in filtered) return filtered.error;
  if (filtered.siteIds.length === 0) return NextResponse.json([]);

  const column =
    type === "channel" ? "utm_medium" : type === "campaign" ? "utm_campaign" : type === "keyword" ? "utm_term" : "referrer_domain";
  const { start } = rangeWindow(range);
  const db = createAdminClient();
  const { data, error } = await db
    .from("analytics_page_views")
    .select("referrer_domain, utm_medium, utm_campaign, utm_term")
    .gte("timestamp", start.toISOString())
    .in("site_id", filtered.siteIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const name = row[column] || (type === "referrer" ? "Direct / None" : "None");
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return NextResponse.json(
    [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20)
  );
}
