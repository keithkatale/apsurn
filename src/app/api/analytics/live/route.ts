import { NextRequest, NextResponse } from "next/server";
import { subMinutes } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnalyticsUser, siteFilterOrError, unauthorized } from "@/lib/analytics/access";

export async function GET(request: NextRequest) {
  const userId = await requireAnalyticsUser();
  if (!userId) return unauthorized();
  const siteId = request.nextUrl.searchParams.get("siteId");
  const filtered = await siteFilterOrError(userId, siteId);
  if ("error" in filtered) return filtered.error;
  if (filtered.siteIds.length === 0) return NextResponse.json({ visitorsNow: 0, visitors: [] });

  const db = createAdminClient();
  const { data, error } = await db
    .from("analytics_active_visitors")
    .select("*")
    .in("site_id", filtered.siteIds)
    .gte("last_seen", subMinutes(new Date(), 5).toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const visitors = (data ?? []).map((row) => ({
    id: row.visitor_id,
    lat: Number(row.latitude ?? 0),
    lng: Number(row.longitude ?? 0),
    country: row.country_code ?? "Unknown",
    city: row.city ?? "Unknown",
    page: row.current_page ?? "/",
    lastSeen: row.last_seen,
    device: row.device_type ?? "desktop",
    referrer: row.referrer_domain ?? "Direct",
  }));

  return NextResponse.json({ visitorsNow: visitors.length, visitors });
}
