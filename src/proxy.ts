import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  const protectedPath =
    request.nextUrl.pathname.startsWith("/setup") ||
    request.nextUrl.pathname.startsWith("/dashboard");

  if (!user && protectedPath) {
    const dest = request.nextUrl.clone();
    // New users hitting setup from landing CTAs should land on signup, not sign-in.
    const authPath = request.nextUrl.pathname.startsWith("/setup") ? "/signup" : "/login";
    dest.pathname = authPath;
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    dest.search = "";
    dest.searchParams.set("next", next);
    return NextResponse.redirect(dest);
  }
  if (user && (request.nextUrl.pathname === "/login" || request.nextUrl.pathname === "/signup")) {
    const next = request.nextUrl.searchParams.get("next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard/copilot";
    return NextResponse.redirect(new URL(safeNext, request.url));
  }
  return response;
}

// Narrow matcher: a broad catch-all under Next 16.3 + Turbopack can leave nested
// App Router pages returning 404 in `next dev` despite the files existing.
export const config = {
  matcher: ["/dashboard/:path*", "/setup/:path*", "/login", "/signup", "/auth/callback"],
};
