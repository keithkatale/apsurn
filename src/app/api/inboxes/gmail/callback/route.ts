import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeGmailCode } from "@/lib/inbox/gmail";
import { encryptToken } from "@/lib/inbox/token-crypto";

const STATE_COOKIE = "gmail_oauth_state";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const errorParam = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const fail = (message: string) =>
    NextResponse.redirect(new URL(`/dashboard/campaigns?panel=settings&error=${encodeURIComponent(message)}`, url.origin));

  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/dashboard/campaigns?panel=settings")}`, url.origin));
    }
    throw error;
  }

  const cookieStore = await cookies();
  const stored = cookieStore.get(STATE_COOKIE)?.value ?? "";
  cookieStore.delete(STATE_COOKIE);
  const pipe = stored.indexOf("|");
  const expectedState = pipe >= 0 ? stored.slice(0, pipe) : stored;
  const nextPath = pipe >= 0 ? stored.slice(pipe + 1) : "";
  if (errorParam) return fail(errorParam);
  if (!code || !state || !expectedState || state !== expectedState) return fail("Gmail connection was cancelled or expired.");

  try {
    const tokens = await exchangeGmailCode(code);
    const db = createAdminClient();
    const { error } = await db.from("connected_inboxes").upsert(
      {
        user_id: userId,
        provider: "gmail",
        email_address: tokens.email,
        access_token_enc: encryptToken(tokens.accessToken),
        refresh_token_enc: encryptToken(tokens.refreshToken),
        token_expires_at: tokens.expiryDate ? new Date(tokens.expiryDate).toISOString() : null,
        scopes: tokens.scopes,
        status: "connected",
      },
      { onConflict: "user_id,email_address" },
    );
    if (error) throw new Error(error.message);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not connect Gmail");
  }

  const next = nextPath?.startsWith("/") ? nextPath : "/dashboard/campaigns?panel=settings";
  const separator = next.includes("?") ? "&" : "?";
  return NextResponse.redirect(new URL(`${next}${separator}inbox=connected`, url.origin));
}
