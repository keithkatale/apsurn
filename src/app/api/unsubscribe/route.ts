import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

export const runtime = "nodejs";

async function optOut(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("u") ?? "";
  const token = request.nextUrl.searchParams.get("t") ?? "";
  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
    return NextResponse.json({ error: "This link is not valid." }, { status: 400 });
  }
  const { error } = await createAdminClient()
    .from("email_preferences")
    .upsert({ user_id: userId, marketing_opt_out: true, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: "Could not update your preference." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** POST only: link scanners follow GET links, and that must never unsubscribe anyone. Also serves one-click unsubscribe (RFC 8058). */
export async function POST(request: NextRequest) {
  return optOut(request);
}
