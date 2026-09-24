import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cronUnauthorized, isCronAuthorized } from "@/lib/jobs/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDeepMarketScan, runMarketScanWithProgress } from "@/lib/market/mutations";
import { MARKET_PLATFORMS } from "@/lib/market/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  companyId: z.string().uuid(),
  platforms: z.array(z.enum(MARKET_PLATFORMS)).optional(),
});

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorized();

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const { companyId, platforms } = parsed.data;
  const first = await runMarketScanWithProgress(db, companyId, () => undefined, platforms);
  const deep = await runDeepMarketScan(db, companyId, platforms);
  return NextResponse.json({
    scanned: first.scanned + deep.scanned,
    saved: first.saved + deep.saved,
    failures: first.failures,
  });
}
