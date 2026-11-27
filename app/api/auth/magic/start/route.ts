import { NextRequest, NextResponse } from "next/server";
import { publicAppOrigin } from "@/lib/auth/google-signin";
import { startMagicLink } from "@/lib/auth/magic-link";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  if (!rateLimit(`magic-start:${clientIp(request)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as { email?: unknown; next?: unknown } | null;
  const result = await startMagicLink({ email: String(body?.email ?? ""), nextPath: body?.next, origin: publicAppOrigin(request) });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
