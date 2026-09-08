import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAnalyticsUser, unauthorized } from "@/lib/analytics/access";
import { publicOrigin, trackingSnippet } from "@/lib/analytics/snippet";

const CreateSiteSchema = z.object({
  domain: z.string().trim().min(1).max(255).transform((val) => {
    try {
      return new URL(val.startsWith("http") ? val : `https://${val}`).hostname.replace(/^www\./, "");
    } catch {
      return val.replace(/^www\./, "");
    }
  }),
  name: z.string().trim().max(120).optional(),
});

export async function GET() {
  const userId = await requireAnalyticsUser();
  if (!userId) return unauthorized();
  const db = createAdminClient();
  const { data, error } = await db
    .from("analytics_sites")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[analytics] failed to fetch sites", error);
    return NextResponse.json([]);
  }
  return NextResponse.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const userId = await requireAnalyticsUser();
  if (!userId) return unauthorized();
  const parsed = CreateSiteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid site" }, { status: 400 });
  }

  const siteId =
    parsed.data.domain.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() +
    "-" +
    Math.random().toString(36).slice(2, 7);
  const db = createAdminClient();
  const { data, error } = await db
    .from("analytics_sites")
    .insert({
      domain: parsed.data.domain,
      name: parsed.data.name || parsed.data.domain,
      site_id: siteId,
      user_id: userId,
    })
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create site" }, { status: 500 });
  }

  const origin = publicOrigin(request.url);
  return NextResponse.json({
    success: true,
    site: data,
    trackingCode: trackingSnippet(origin, data.site_id),
  });
}

export async function DELETE(request: NextRequest) {
  const userId = await requireAnalyticsUser();
  if (!userId) return unauthorized();
  const siteId = request.nextUrl.searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  const db = createAdminClient();
  const { error } = await db.from("analytics_sites").delete().eq("user_id", userId).eq("site_id", siteId);
  if (error) return NextResponse.json({ error: "Failed to delete site" }, { status: 500 });
  return NextResponse.json({ success: true });
}
