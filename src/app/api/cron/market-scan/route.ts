import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized, isCronAuthorized } from "@/lib/jobs/auth";
import { scanAllCompaniesMarket } from "@/lib/jobs/handlers";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorized();
  const result = await scanAllCompaniesMarket();
  return NextResponse.json(result);
}
