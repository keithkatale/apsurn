import { NextRequest, NextResponse } from "next/server";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { confirmEmailVerification } from "@/lib/auth/email-verification";
import { GUEST_ID_COOKIE } from "@/lib/auth/guest";

export async function POST(request: NextRequest) {
  let userId: string | undefined;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (!(error instanceof AuthenticationError)) throw error;
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : undefined;
  const token = typeof body?.token === "string" ? body.token : undefined;

  try {
    const result = await confirmEmailVerification({ userId, code, token });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: "code" in result ? result.code : undefined },
        { status: result.status },
      );
    }
    const response = NextResponse.json({ ok: true, next: result.nextPath });
    response.cookies.set(GUEST_ID_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    console.error("[auth/verify/confirm]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not verify that code." }, { status: 500 });
  }
}
