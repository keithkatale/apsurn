import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export function cronUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Compares secrets without leaking, through timing, how many leading characters matched. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Cloud Scheduler / internal job calls: `Authorization: Bearer $CRON_SECRET`. */
export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV === "development";
  const auth = request.headers.get("authorization");
  if (auth && safeEqual(auth, `Bearer ${secret}`)) return true;
  const header = request.headers.get("x-cron-secret");
  return Boolean(header && safeEqual(header, secret));
}
