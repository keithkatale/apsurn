import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { gmailAuthUrl } from "@/lib/inbox/gmail";

const STATE_COOKIE = "gmail_oauth_state";

export async function GET(request: NextRequest) {
  try {
    await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/dashboard/campaigns?panel=settings")}`, request.url));
    }
    throw error;
  }

  try {
    const state = randomBytes(24).toString("hex");
    const next = request.nextUrl.searchParams.get("next") || "/dashboard/campaigns?panel=settings";
    const cookieStore = await cookies();
    cookieStore.set(STATE_COOKIE, `${state}|${next}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    return NextResponse.redirect(gmailAuthUrl(state));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gmail is not configured. Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.";
    return NextResponse.redirect(
      new URL(`/dashboard/campaigns?panel=settings&error=${encodeURIComponent(message)}`, request.url),
    );
  }
}
