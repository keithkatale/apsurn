import { NextRequest, NextResponse } from "next/server";
import { confirmEmailVerification, safeNextPath } from "@/lib/auth/email-verification";
import { GUEST_ID_COOKIE } from "@/lib/auth/guest";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const failed = (message: string) => {
    const dest = new URL("/signup", request.url);
    dest.searchParams.set("error", "verify");
    dest.searchParams.set("message", message.slice(0, 180));
    return NextResponse.redirect(dest);
  };

  if (!token) return failed("That verification link is incomplete.");

  try {
    const result = await confirmEmailVerification({ token });
    if (!result.ok) return failed(result.error);
    const dest = new URL(safeNextPath(result.nextPath), request.url);
    const response = NextResponse.redirect(dest);
    response.cookies.set(GUEST_ID_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    console.error("[auth/verify]", error instanceof Error ? error.message : error);
    return failed("Could not verify that link.");
  }
}
