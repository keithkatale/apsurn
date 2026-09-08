import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnalyticsUser, siteFilterOrError, unauthorized } from "@/lib/analytics/access";
import { parseAnalyticsRange, rangeWindow } from "@/lib/analytics/range";

function topCounts(entries: Array<string | null | undefined>, emptyLabel: string) {
  const counts = new Map<string, number>();
  for (const value of entries) {
    const name = value || emptyLabel;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);
}

export async function GET(request: NextRequest) {
  const userId = await requireAnalyticsUser();
  if (!userId) return unauthorized();
  const range = parseAnalyticsRange(request.nextUrl.searchParams.get("range"));
  const type = request.nextUrl.searchParams.get("type") ?? "page";
  const siteId = request.nextUrl.searchParams.get("siteId");
  const filtered = await siteFilterOrError(userId, siteId);
  if ("error" in filtered) return filtered.error;
  if (filtered.siteIds.length === 0) return NextResponse.json([]);

  const { start } = rangeWindow(range);
  const db = createAdminClient();

  if (type === "entry_page" || type === "exit_page") {
    const column = type === "entry_page" ? "entry_url" : "exit_url";
    const { data, error } = await db
      .from("analytics_sessions")
      .select("entry_url, exit_url")
      .gte("started_at", start.toISOString())
      .in("site_id", filtered.siteIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const paths = (data ?? []).map((row) => {
      const raw = row[column];
      if (!raw) return "/";
      try {
        return raw.startsWith("http") ? new URL(raw).pathname : raw;
      } catch {
        return raw;
      }
    });
    return NextResponse.json(topCounts(paths, "/"));
  }

  const { data, error } = await db
    .from("analytics_page_views")
    .select("path, url")
    .gte("timestamp", start.toISOString())
    .in("site_id", filtered.siteIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const keys = (data ?? []).map((row) => {
    if (type === "hostname") {
      try {
        return new URL(row.url).hostname;
      } catch {
        return "Unknown";
      }
    }
    return row.path || "/";
  });
  return NextResponse.json(topCounts(keys, "/"));
}
