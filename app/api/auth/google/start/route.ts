import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  encodeGoogleSignInState,
  googleSignInAuthUrl,
  googleSignInCookieName,
  publicAppOrigin,
} from "@/lib/auth/google-signin";

export async function GET(request: NextRequest) {
  const nextRaw = request.nextUrl.searchParams.get("next") || "/dashboard/copilot";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/dashboard/copilot";
  const origin = publicAppOrigin(request);

  try {
    const state = randomBytes(24).toString("hex");
    const res = NextResponse.redirect(googleSignInAuthUrl(state, request));
    res.cookies.set(googleSignInCookieName(), encodeGoogleSignInState(state, next), {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/",
      maxAge: 600,
    });
    return res;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google sign-in is not configured.";
    return NextResponse.redirect(
      new URL(`/login?error=auth&next=${encodeURIComponent(next)}&detail=${encodeURIComponent(message)}`, origin),
    );
  }
}
