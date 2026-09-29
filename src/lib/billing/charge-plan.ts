import { createAdminClient } from "@/lib/supabase/admin";
import { getDodoClient } from "@/lib/billing/dodo";
import { PLANS, type PlanKey } from "@/lib/billing/plans";

const PENDING_MS = 3 * 60 * 1000;

/**
 * Charge the saved card for the plan price. Used when the credit balance hits
 * zero. Dodo on-demand subscriptions do not renew on a calendar, so each
 * refill is an explicit charge. A recent pending charge is not repeated.
 */
export async function requestPlanCharge(userId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data: sub } = await db
    .from("billing_subscriptions")
    .select("dodo_subscription_id, plan_key, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub?.dodo_subscription_id) return false;

  const planKey = sub.plan_key as PlanKey;
  const plan = PLANS[planKey];
  if (!plan) return false;

  const { data: recent } = await db
    .from("credit_ledger")
    .select("reason, created_at")
    .eq("user_id", userId)
    .in("reason", ["plan_charge_requested", "plan_charge_failed", "plan_cycle"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent?.reason === "plan_charge_requested") {
    const age = Date.now() - new Date(recent.created_at).getTime();
    if (age >= 0 && age < PENDING_MS) return true;
  }

  try {
    const charge = await getDodoClient().subscriptions.charge(sub.dodo_subscription_id, {
      product_price: plan.priceUsd * 100,
      product_currency: "USD",
      product_description: `${plan.name} — credit refill`,
      metadata: {
        user_id: userId,
        plan_key: planKey,
        kind: "plan_cycle",
      },
    });
    const paymentId = charge.payment_id;
    const { data: credits } = await db.from("credit_balances").select("balance").eq("user_id", userId).maybeSingle();
    await db.from("credit_ledger").insert({
      user_id: userId,
      delta: 0,
      balance_after: credits?.balance ?? 0,
      reason: "plan_charge_requested",
      metadata: { payment_id: paymentId, plan_key: planKey, subscription_id: sub.dodo_subscription_id },
    });
    return true;
  } catch (error) {
    console.error("[billing] plan charge failed", error);
    return false;
  }
}
