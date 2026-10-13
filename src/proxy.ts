import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGuestUser } from "@/lib/auth/guest";

const SETUP_DONE_COOKIE = "apsurn_setup_done";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Verify the session token locally (no round trip to Supabase on every request). Pages and API routes
  // that act on data still call getUser() themselves, so a revoked session is caught where it matters.
  const { data: claimData } = await supabase.auth.getClaims();
  const claims = claimData?.claims as
    | { sub?: string; email?: string; is_anonymous?: boolean; user_metadata?: Record<string, unknown> }
    | undefined;
  const user = claims?.sub
    ? { id: claims.sub, email: claims.email ?? null, is_anonymous: claims.is_anonymous, user_metadata: claims.user_metadata ?? null }
    : null;
  const protectedPath = request.nextUrl.pathname.startsWith("/dashboard");

  if (!user && protectedPath) {
    const dest = request.nextUrl.clone();
    const authPath = "/login";
    dest.pathname = authPath;
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    dest.search = "";
    dest.searchParams.set("next", next);
    return redirectKeepingCookies(dest, response);
  }
  // Once setup is known to be finished, remember it briefly so we don't query the database on every navigation.
  const setupKnownDone = Boolean(user && request.cookies.get(SETUP_DONE_COOKIE)?.value === user.id);
  const setupCheck = user && !setupKnownDone ? await needsSetup(user.id) : false;
  const setupRequired = setupCheck === true;
  if (user && !setupKnownDone && setupCheck === false) {
    response.cookies.set(SETUP_DONE_COOKIE, user.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 6,
    });
  }
  if (user && setupRequired) {
    const pathname = request.nextUrl.pathname;
    const onSetup = pathname === "/setup" || pathname.startsWith("/setup/");
    if (!onSetup) {
      return redirectKeepingCookies(new URL("/setup", request.url), response);
    }
  }
  if (user && !isGuestUser(user) && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")) {
    const next = request.nextUrl.searchParams.get("next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard/copilot";
    return redirectKeepingCookies(new URL(safeNext, request.url), response);
  }
  return response;
}

/**
 * Signed-in users who never finished setup have no company blueprint yet.
 * The user-scoped client cannot read these tables, so this uses the service role.
 */
/** true: setup unfinished. false: finished. null: couldn't tell (don't cache). */
async function needsSetup(userId: string): Promise<boolean | null> {
  try {
    const admin = createAdminClient();
    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (companyError) return null;
    if (!company?.id) return true;
    const { data: blueprint, error: blueprintError } = await admin
      .from("company_blueprints")
      .select("id")
      .eq("company_id", company.id)
      .maybeSingle();
    if (blueprintError) return null;
    return !blueprint?.id;
  } catch {
    return null;
  }
}

function redirectKeepingCookies(destination: URL, source: NextResponse) {
  const redirect = NextResponse.redirect(destination);
  for (const cookie of source.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

// Narrow matcher: a broad catch-all under Next 16.3 + Turbopack can leave nested
// App Router pages returning 404 in `next dev` despite the files existing.
export const config = {
  matcher: ["/dashboard/:path*", "/setup/:path*", "/login", "/signup", "/auth/callback"],
};
