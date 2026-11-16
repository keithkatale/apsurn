import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError } from "@/lib/auth/session";
import { spendCredits } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { requireCompany } from "@/lib/market/access";
import { runRadarScan } from "@/lib/market/scan-run";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({ depth: z.enum(["broad", "deep"]).optional() });

export async function POST(request: NextRequest) {
  try {
    const { userId, db, companyId } = await requireCompany();
    if (!companyId) return NextResponse.json({ error: "Set up your company first" }, { status: 400 });
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const depth = parsed.data.depth ?? "broad";

    if (depth === "deep") {
      const { count } = await db
        .from("market_keywords")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("is_active", true);
      if ((count ?? 0) === 0) {
        const empty = await runRadarScan(db, { userId, companyId, depth, skipIfFresh: false });
        return NextResponse.json(empty);
      }
      try {
        await spendCredits({
          userId,
          amount: CREDIT_COSTS.market_scan,
          action: "market_scan",
          metadata: { companyId, depth },
        });
      } catch (error) {
        const code = (error as Error & { code?: string }).code;
        if (code === "credits_exhausted") {
          return NextResponse.json(
            { error: "Not enough credits to scan deeper. The conversations already found are still here.", code },
            { status: 402 },
          );
        }
        throw error;
      }
    }

    const result = await runRadarScan(db, { userId, companyId, depth, skipIfFresh: depth === "broad" });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    console.error("[radar] scan failed", error);
    return NextResponse.json({ error: "Radar scan failed" }, { status: 500 });
  }
}
