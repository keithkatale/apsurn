import { NextRequest, NextResponse } from "next/server";
import { confirmMagicLink } from "@/lib/auth/magic-link";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  if (!rateLimit(`magic-confirm:${clientIp(request)}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
  }
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const result = await confirmMagicLink(body?.token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, next: result.nextPath, isNew: result.isNew });
}
