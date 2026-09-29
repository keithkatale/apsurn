import { createAdminClient } from "@/lib/supabase/admin";
import { grantCredits } from "@/lib/billing/credits";
import { PLANS, STARTER_CREDIT_USD, STARTER_CREDITS, type PlanKey } from "@/lib/billing/plans";

/** Grant once per reason+ref so webhook retries cannot double-issue credits. */
export async function grantCreditsOnce(params: {
  userId: string;
  amount: number;
  reason: string;
  ref: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  if (params.amount <= 0) return false;
  const db = createAdminClient();
  const { data: existing } = await db
    .from("credit_ledger")
    .select("id")
    .eq("user_id", params.userId)
    .eq("reason", params.reason)
    .contains("metadata", { ref: params.ref })
    .limit(1)
    .maybeSingle();
  if (existing) return false;

  await grantCredits({
    userId: params.userId,
    amount: params.amount,
    reason: params.reason,
    metadata: { ...params.metadata, ref: params.ref },
  });
  return true;
}

/**
 * First activation gets $20 in free credits. Customers who already received
 * a paid allotment are left alone.
 */
export async function grantStarterCreditsIfNew(userId: string, subscriptionId: string): Promise<void> {
  const db = createAdminClient();
  const { data: prior } = await db
    .from("credit_ledger")
    .select("id")
    .eq("user_id", userId)
    .in("reason", ["starter_credits", "plan_activation", "plan_renewal", "plan_cycle"])
    .limit(1)
    .maybeSingle();
  if (prior) return;

  await grantCreditsOnce({
    userId,
    amount: STARTER_CREDITS,
    reason: "starter_credits",
    ref: `${subscriptionId}:starter`,
    metadata: { usd: STARTER_CREDIT_USD, subscription_id: subscriptionId },
  });
}

export async function grantPlanCycleCredits(userId: string, planKey: PlanKey, paymentId: string): Promise<void> {
  const amount = PLANS[planKey]?.creditsPerMonth ?? 0;
  await grantCreditsOnce({
    userId,
    amount,
    reason: "plan_cycle",
    ref: paymentId,
    metadata: { plan_key: planKey, payment_id: paymentId },
  });
}
