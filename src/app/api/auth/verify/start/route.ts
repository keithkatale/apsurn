import { NextRequest, NextResponse } from "next/server";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { publicAppOrigin } from "@/lib/auth/google-signin";
import { safeNextPath, startEmailVerification } from "@/lib/auth/email-verification";

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const nextPath = safeNextPath(body?.next, "/dashboard/campaigns");

  try {
    const result = await startEmailVerification({
      userId,
      email,
      password,
      nextPath,
      origin: publicAppOrigin(request),
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: "code" in result ? result.code : undefined },
        { status: result.status },
      );
    }
    return NextResponse.json({ ok: true, email: result.email });
  } catch (error) {
    console.error("[auth/verify/start]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Could not send the verification email." }, { status: 500 });
  }
}
