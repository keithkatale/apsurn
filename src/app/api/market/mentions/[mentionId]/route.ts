import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";

const patchSchema = z.object({
  is_saved: z.boolean().optional(),
  needs_follow_up: z.boolean().optional(),
  saved_account_name: z.string().trim().max(200).nullable().optional(),
  save_note: z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ mentionId: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const { mentionId } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: mention } = await db
    .from("market_mentions")
    .select("id, account_id, is_saved")
    .eq("id", mentionId)
    .eq("company_id", company.id)
    .maybeSingle();

  if (!mention) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch = { ...parsed.data } as Record<string, unknown>;

  if (parsed.data.is_saved === true) {
    patch.saved_at = new Date().toISOString();
    const name = parsed.data.saved_account_name?.trim();
    if (name) {
      patch.author_name = name;
      patch.saved_account_name = name;
    }
  }

  if (parsed.data.is_saved === false) {
    patch.saved_at = null;
    patch.save_note = null;
    patch.saved_account_name = null;
  }

  const { error } = await db.from("market_mentions").update(patch).eq("id", mentionId).eq("company_id", company.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const confirmedName = parsed.data.is_saved === true ? parsed.data.saved_account_name?.trim() : null;
  if (confirmedName && mention.account_id) {
    await db.from("market_accounts").update({ name: confirmedName }).eq("id", mention.account_id).eq("company_id", company.id);
  }

  return NextResponse.json({ ok: true });
}
