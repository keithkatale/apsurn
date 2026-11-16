import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError } from "@/lib/auth/session";
import { requireCompany } from "@/lib/market/access";
import { DEFAULT_MARKET_PLATFORMS } from "@/lib/market/types";
import { loadRadarFeed } from "@/lib/market/feed";

export const runtime = "nodejs";

const createSchema = z.object({ keyword: z.string().trim().min(3).max(80) });
const toggleSchema = z.object({ id: z.string().uuid(), isActive: z.boolean() });

export async function POST(request: NextRequest) {
  try {
    const { userId, db, companyId } = await requireCompany();
    if (!companyId) return NextResponse.json({ error: "Set up your company first" }, { status: 400 });
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Use a short phrase, 3 to 80 characters" }, { status: 400 });

    const keyword = parsed.data.keyword.replace(/\s+/g, " ");
    const { data: existing } = await db.from("market_keywords").select("id").eq("company_id", companyId).eq("keyword", keyword).maybeSingle();
    if (existing?.id) {
      const { error } = await db.from("market_keywords").update({ is_active: true }).eq("id", existing.id).eq("company_id", companyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { count } = await db.from("market_keywords").select("id", { count: "exact", head: true }).eq("company_id", companyId);
      if ((count ?? 0) >= 20) return NextResponse.json({ error: "Pause a phrase before adding another" }, { status: 400 });
      const { error } = await db.from("market_keywords").insert({
        user_id: userId,
        company_id: companyId,
        keyword,
        platforms: DEFAULT_MARKET_PLATFORMS,
        is_active: true,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const feed = await loadRadarFeed(db, userId, companyId);
    return NextResponse.json({ feed });
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId, db, companyId } = await requireCompany();
    if (!companyId) return NextResponse.json({ error: "Set up your company first" }, { status: 400 });
    const parsed = toggleSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const { error } = await db
      .from("market_keywords")
      .update({ is_active: parsed.data.isActive })
      .eq("id", parsed.data.id)
      .eq("company_id", companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const feed = await loadRadarFeed(db, userId, companyId);
    return NextResponse.json({ feed });
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
}
