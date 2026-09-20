import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { MARKET_PLATFORMS } from "@/lib/market/types";

export async function GET() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ accounts: [] });

  const { data, error } = await db
    .from("market_accounts")
    .select("*")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ accounts: data ?? [] });
}

const followSchema = z.object({
  platform: z.enum(MARKET_PLATFORMS),
  handle: z.string().trim().min(1).max(160),
  name: z.string().trim().max(160).nullable().optional(),
  avatarUrl: z.string().trim().max(1000).nullable().optional(),
  is_followed: z.boolean(),
});

/**
 * Follows (or unfollows) an author by platform + handle, creating the
 * account row on demand.
 *
 * Accounts are no longer created while scanning — that inserted a row for
 * every author of every discovered post and swamped this list — so following
 * someone seen in the feed is the point at which they first get stored.
 */
export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const parsed = followSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { platform, handle, name, avatarUrl, is_followed } = parsed.data;

  const { data, error } = await db
    .from("market_accounts")
    .upsert(
      {
        company_id: company.id,
        platform,
        handle,
        name: name ?? null,
        avatar_url: avatarUrl ?? null,
        is_followed,
      },
      { onConflict: "company_id,platform,handle" }
    )
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Link any mentions already stored from this author to the new account row,
  // so following someone immediately makes "Following only" show their posts.
  await db
    .from("market_mentions")
    .update({ account_id: data.id })
    .eq("company_id", company.id)
    .eq("platform", platform)
    .eq("author_handle", handle)
    .is("account_id", null);

  return NextResponse.json({ account: data });
}
