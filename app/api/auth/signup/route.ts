import { NextResponse } from "next/server";
import { directSignup } from "@/lib/auth/signup";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown; nextPath?: unknown } | null;
  if (typeof body?.email !== "string" || typeof body?.password !== "string") {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  const result = await directSignup({
    email: body.email,
    password: body.password,
    nextPath: typeof body.nextPath === "string" ? body.nextPath : undefined,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: "code" in result ? result.code : undefined },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: true, userId: result.userId, next: result.nextPath });
}
