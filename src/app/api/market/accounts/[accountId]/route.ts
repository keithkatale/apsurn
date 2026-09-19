import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";

const patchSchema = z.object({ is_followed: z.boolean() });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ accountId: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const { accountId } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await db
    .from("market_accounts")
    .update({ is_followed: parsed.data.is_followed })
    .eq("id", accountId)
    .eq("company_id", company.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
