import { NextResponse } from "next/server";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { getBillingStatus } from "@/lib/billing/entitlements";
import { PLANS, TOPUPS, TRIAL_AMOUNT_USD, TRIAL_DAYS } from "@/lib/billing/plans";

export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const status = await getBillingStatus(userId);
    return NextResponse.json({
      ...status,
      trialDays: TRIAL_DAYS,
      trialAmountUsd: TRIAL_AMOUNT_USD,
      plans: Object.values(PLANS).map((p) => ({
        key: p.key,
        name: p.name,
        priceUsd: p.priceUsd,
        creditsPerMonth: p.creditsPerMonth,
        description: p.description,
        features: p.features,
        highlight: Boolean(p.highlight),
      })),
      topups: Object.values(TOPUPS).map((t) => ({
        key: t.key,
        name: t.name,
        priceUsd: t.priceUsd,
        credits: t.credits,
      })),
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load billing" }, { status: 500 });
  }
}
