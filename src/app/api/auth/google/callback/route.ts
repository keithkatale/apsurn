import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  decodeGoogleSignInState,
  exchangeGoogleSignInCode,
  googleSignInCookieName,
  publicAppOrigin,
} from "@/lib/auth/google-signin";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const origin = publicAppOrigin(request);
  const fail = (next: string) =>
    NextResponse.redirect(new URL(`/login?error=auth&next=${encodeURIComponent(next)}`, origin));

  const stored = request.cookies.get(googleSignInCookieName())?.value ?? "";
  const { state: expectedState, next } = decodeGoogleSignInState(stored);
  const clear = (res: NextResponse) => {
    res.cookies.delete(googleSignInCookieName());
    return res;
  };

  if (url.searchParams.get("error")) return clear(fail(next));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !expectedState || state !== expectedState) {
    return clear(fail(next));
  }

  try {
    const tokens = await exchangeGoogleSignInCode(code, request);
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: tokens.idToken,
      access_token: tokens.accessToken ?? undefined,
    });
    if (error) throw error;
    return clear(NextResponse.redirect(new URL(next, origin)));
  } catch (error) {
    console.error("[auth/google]", error);
    return clear(fail(next));
  }
}
