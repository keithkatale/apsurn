import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { MARKET_PLATFORMS } from "@/lib/market/types";

const createSchema = z.object({
  keyword: z.string().trim().min(1).max(120),
  platforms: z.array(z.enum(MARKET_PLATFORMS)).min(1).max(4),
});

async function currentCompanyId(db: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

export async function GET() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const db = createAdminClient();
  const companyId = await currentCompanyId(db, userId);
  if (!companyId) return NextResponse.json({ keywords: [] });

  const { data, error } = await db
    .from("market_keywords")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ keywords: data ?? [] });
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });

  const db = createAdminClient();
  const companyId = await currentCompanyId(db, userId);
  if (!companyId) return NextResponse.json({ error: "Build and approve your company blueprint first" }, { status: 400 });

  const { data, error } = await db
    .from("market_keywords")
    .insert({ user_id: userId, company_id: companyId, keyword: parsed.data.keyword, platforms: parsed.data.platforms })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ keyword: data });
}
