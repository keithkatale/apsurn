import { NextRequest, NextResponse } from "next/server";

export function cronUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Cloud Scheduler / internal job calls: `Authorization: Bearer $CRON_SECRET`. */
export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV === "development";
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return request.headers.get("x-cron-secret") === secret;
}
