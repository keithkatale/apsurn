import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";

const PAGE_SIZE = 20;

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ mentions: [], nextCursor: null });

  const cursor = request.nextUrl.searchParams.get("before");
  const accountId = request.nextUrl.searchParams.get("accountId");

  let query = db
    .from("market_mentions")
    .select("*, market_keywords(keyword)")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor) query = query.lt("created_at", cursor);
  if (accountId) query = query.eq("account_id", accountId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const mentions = data ?? [];
  const nextCursor = mentions.length === PAGE_SIZE ? mentions[mentions.length - 1].created_at : null;

  return NextResponse.json({ mentions, nextCursor });
}

/** Clears the current (unsaved) feed so the user can start afresh — saved mentions are kept. */
export async function DELETE() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ cleared: 0 });

  const { data, error } = await db
    .from("market_mentions")
    .delete()
    .eq("company_id", company.id)
    .eq("is_saved", false)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cleared: data?.length ?? 0 });
}
