import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized, isCronAuthorized } from "@/lib/jobs/auth";
import { runDueRadarScans } from "@/lib/market/scheduled";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorized();
  const result = await runDueRadarScans();
  return NextResponse.json(result);
}
