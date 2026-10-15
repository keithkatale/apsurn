import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const bodySchema = z.object({
  visitorId: z.string().min(8).max(64),
  sessionId: z.string().min(8).max(64),
  event: z.string().min(1).max(40).default("pageview"),
  path: z.string().min(1).max(300),
  referrer: z.string().max(500).optional(),
  utm: z
    .object({ source: z.string().max(80).optional(), medium: z.string().max(80).optional(), campaign: z.string().max(120).optional() })
    .optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const BOT = /bot|crawl|spider|slurp|headless|preview|facebookexternalhit|monitor|lighthouse|curl|wget/i;

function deviceOf(userAgent: string): string {
  if (/ipad|tablet/i.test(userAgent)) return "tablet";
  if (/mobi|iphone|android/i.test(userAgent)) return "mobile";
  return "desktop";
}

function hostOf(referrer: string | undefined, ownHost: string): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
    return host && host !== ownHost.replace(/^www\./, "") ? host : null;
  } catch {
    return null;
  }
}

/** First-party product analytics. Fire-and-forget from the browser; never blocks the page and never errors loudly. */
export async function POST(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "";
  if (!userAgent || BOT.test(userAgent)) return new NextResponse(null, { status: 204 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });
  const { visitorId, sessionId, event, path, referrer, utm, meta } = parsed.data;
  if (path.startsWith("/admin")) return new NextResponse(null, { status: 204 });

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    userId = (data?.claims as { sub?: string } | undefined)?.sub ?? null;
  } catch {
    userId = null;
  }

  const country =
    request.headers.get("cf-ipcountry") ||
    request.headers.get("x-vercel-ip-country") ||
    request.headers.get("x-appengine-country") ||
    null;

  const { error } = await createAdminClient()
    .from("app_events")
    .insert({
      visitor_id: visitorId,
      session_id: sessionId,
      user_id: userId,
      event,
      path: path.split("#")[0],
      referrer_host: hostOf(referrer, request.nextUrl.hostname),
      utm_source: utm?.source ?? null,
      utm_medium: utm?.medium ?? null,
      utm_campaign: utm?.campaign ?? null,
      device: deviceOf(userAgent),
      country: country && country !== "XX" ? country.toUpperCase().slice(0, 2) : null,
      meta: meta ?? {},
    });
  // Before migration 0037 there is no table: analytics just stays empty.
  if (error && !/app_events|schema cache|does not exist/i.test(error.message)) {
    console.error("[track]", error.message);
  }
  return new NextResponse(null, { status: 204 });
}
