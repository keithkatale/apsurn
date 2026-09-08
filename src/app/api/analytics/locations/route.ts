import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnalyticsUser, siteFilterOrError, unauthorized } from "@/lib/analytics/access";
import { parseAnalyticsRange, rangeWindow } from "@/lib/analytics/range";

export async function GET(request: NextRequest) {
  const userId = await requireAnalyticsUser();
  if (!userId) return unauthorized();
  const range = parseAnalyticsRange(request.nextUrl.searchParams.get("range"));
  const type = request.nextUrl.searchParams.get("type") ?? "country";
  const siteId = request.nextUrl.searchParams.get("siteId");
  const filtered = await siteFilterOrError(userId, siteId);
  if ("error" in filtered) return filtered.error;
  if (filtered.siteIds.length === 0) return NextResponse.json([]);

  const column = type === "region" ? "region" : type === "city" ? "city" : "country";
  const { start } = rangeWindow(range);
  const db = createAdminClient();
  const { data, error } = await db
    .from("analytics_page_views")
    .select("country, region, city, country_code")
    .gte("timestamp", start.toISOString())
    .in("site_id", filtered.siteIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts = new Map<string, number>();
  const codes = new Map<string, string>();
  for (const row of data ?? []) {
    const name = row[column] || "Unknown";
    counts.set(name, (counts.get(name) ?? 0) + 1);
    if (row.country_code) codes.set(name, row.country_code);
  }
  return NextResponse.json(
    [...counts.entries()]
      .map(([name, value]) => ({ name, value, code: codes.get(name) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20)
  );
}
