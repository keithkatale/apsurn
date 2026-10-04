import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGuestUser } from "@/lib/auth/guest";

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

  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  const setupRequired = user ? await needsSetup(user.id) : false;
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
async function needsSetup(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (companyError) return false;
    if (!company?.id) return true;
    const { data: blueprint, error: blueprintError } = await admin
      .from("company_blueprints")
      .select("id")
      .eq("company_id", company.id)
      .maybeSingle();
    if (blueprintError) return false;
    return !blueprint?.id;
  } catch {
    return false;
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
