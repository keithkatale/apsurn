import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUserAgent } from "@/lib/analytics/user-agent-parser";
import { getGeolocation } from "@/lib/analytics/geolocation";

const PageViewSchema = z.object({
  type: z.literal("pageview"),
  siteId: z.string().min(1).max(120),
  visitorId: z.string().uuid(),
  sessionId: z.string().uuid(),
  sessionStartTime: z.number().optional(),
  url: z.string().url(),
  path: z.string().max(2048),
  referrer: z.string().optional(),
  title: z.string().max(500).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  language: z.string().optional(),
  userAgent: z.string(),
});

function corsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function utmFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return {
      utm_source: parsed.searchParams.get("utm_source"),
      utm_medium: parsed.searchParams.get("utm_medium"),
      utm_campaign: parsed.searchParams.get("utm_campaign"),
      utm_term: parsed.searchParams.get("utm_term"),
      utm_content: parsed.searchParams.get("utm_content"),
    };
  } catch {
    return {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
    };
  }
}

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { status: 200, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);
  try {
    const body = await request.json().catch(() => null);
    const validated = PageViewSchema.parse(body);
    const db = createAdminClient();

    const { data: site } = await db
      .from("analytics_sites")
      .select("site_id")
      .eq("site_id", validated.siteId)
      .maybeSingle();
    if (!site) {
      return NextResponse.json({ error: "Unknown site" }, { status: 404, headers });
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";
    const uaInfo = parseUserAgent(validated.userAgent);
    const geoData = await getGeolocation(ip);
    const utm = utmFromUrl(validated.url);

    let referrerDomain: string | null = null;
    if (validated.referrer) {
      try {
        referrerDomain = new URL(validated.referrer).hostname;
      } catch {
        referrerDomain = null;
      }
    }

    const { error: pageViewError } = await db.from("analytics_page_views").insert({
      site_id: validated.siteId,
      visitor_id: validated.visitorId,
      session_id: validated.sessionId,
      url: validated.url,
      path: validated.path,
      title: validated.title,
      referrer: validated.referrer,
      referrer_domain: referrerDomain,
      ...utm,
      browser: uaInfo.browser,
      browser_version: uaInfo.browserVersion,
      os: uaInfo.os,
      os_version: uaInfo.osVersion,
      device_type: uaInfo.device,
      screen_width: validated.width,
      screen_height: validated.height,
      country: geoData.country,
      country_code: geoData.countryCode,
      region: geoData.region,
      city: geoData.city,
      latitude: geoData.latitude,
      longitude: geoData.longitude,
    });

    if (pageViewError) {
      console.error("[analytics] page view insert failed", pageViewError);
      return NextResponse.json({ error: "Failed to track page view" }, { status: 500, headers });
    }

    const now = new Date();
    const startTime = validated.sessionStartTime ? new Date(validated.sessionStartTime) : now;
    const { data: existingSession } = await db
      .from("analytics_sessions")
      .select("page_views")
      .eq("site_id", validated.siteId)
      .eq("session_id", validated.sessionId)
      .maybeSingle();

    const pageViews = (existingSession?.page_views ?? 0) + 1;
    const duration = Math.max(0, Math.floor((now.getTime() - startTime.getTime()) / 1000));

    const { error: sessionError } = await db.from("analytics_sessions").upsert(
      {
        site_id: validated.siteId,
        visitor_id: validated.visitorId,
        session_id: validated.sessionId,
        started_at: startTime.toISOString(),
        ended_at: now.toISOString(),
        duration,
        page_views: pageViews,
        bounced: pageViews === 1,
        entry_url: existingSession ? undefined : validated.url,
        entry_referrer: existingSession ? undefined : validated.referrer,
        exit_url: validated.url,
        country_code: geoData.countryCode,
        city: geoData.city,
        device_type: uaInfo.device,
        browser: uaInfo.browser,
        os: uaInfo.os,
      },
      { onConflict: "site_id,session_id" }
    );
    if (sessionError) console.error("[analytics] session upsert failed", sessionError);

    const { error: activeError } = await db.from("analytics_active_visitors").upsert(
      {
        site_id: validated.siteId,
        visitor_id: validated.visitorId,
        session_id: validated.sessionId,
        last_seen: now.toISOString(),
        current_page: validated.path,
        country_code: geoData.countryCode,
        city: geoData.city,
        latitude: geoData.latitude,
        longitude: geoData.longitude,
        device_type: uaInfo.device,
        referrer_domain: referrerDomain,
      },
      { onConflict: "site_id,visitor_id" }
    );
    if (activeError) console.error("[analytics] active visitor upsert failed", activeError);

    return NextResponse.json({ success: true }, { status: 200, headers });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400, headers }
      );
    }
    console.error("[analytics] ingest failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers });
  }
}
