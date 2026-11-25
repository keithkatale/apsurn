import { createAdminClient } from "@/lib/supabase/admin";
import { CREDIT_COSTS, PLANS, type PlanKey } from "@/lib/billing/plans";

export type CreditAction = keyof typeof CREDIT_COSTS;

/** Statuses that still grant access. `past_due` is Dodo's grace period (access kept). */
const ACCESS_STATUSES = new Set(["active", "past_due"]);

export type BillingState = {
  planKey: PlanKey | null;
  status: string | null;
  /** True when the subscription currently grants access to paid features. */
  active: boolean;
  planCredits: number;
  topupCredits: number;
  credits: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  dodoCustomerId: string | null;
  subscriptionId: string | null;
};

export async function getBillingState(userId: string): Promise<BillingState> {
  const db = createAdminClient();
  const { data } = await db
    .from("billing_accounts")
    .select(
      "plan_key, subscription_status, plan_credits, topup_credits, current_period_end, cancel_at_period_end, dodo_customer_id, subscription_id",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const planCredits = data?.plan_credits ?? 0;
  const topupCredits = data?.topup_credits ?? 0;
  const status = data?.subscription_status ?? null;
  return {
    planKey: (data?.plan_key as PlanKey | null) ?? null,
    status,
    active: Boolean(data?.plan_key) && ACCESS_STATUSES.has(status ?? ""),
    planCredits,
    topupCredits,
    credits: planCredits + topupCredits,
    currentPeriodEnd: data?.current_period_end ?? null,
    cancelAtPeriodEnd: data?.cancel_at_period_end ?? false,
    dodoCustomerId: data?.dodo_customer_id ?? null,
    subscriptionId: data?.subscription_id ?? null,
  };
}

export function creditCost(action: CreditAction, units = 1): number {
  return CREDIT_COSTS[action] * Math.max(0, units);
}

export type CreditGate =
  | { ok: true; state: BillingState }
  | { ok: false; response: Response };

function paymentRequired(code: "plan_required" | "insufficient_credits", message: string, extra: object = {}) {
  return Response.json({ error: message, code, ...extra }, { status: 402 });
}

/**
 * Gate for a paid action. Requires an active subscription and enough credits for `cost`.
 * Dodo does not block usage at a zero balance, so every billable route must call this first.
 */
export async function requirePaidCredits(userId: string, cost: number): Promise<CreditGate> {
  const state = await getBillingState(userId);
  if (!state.active) {
    return {
      ok: false,
      response: paymentRequired("plan_required", "Choose a plan to use this feature.", { credits: state.credits }),
    };
  }
  if (state.credits < cost) {
    return {
      ok: false,
      response: paymentRequired("insufficient_credits", "You're out of credits. Top up or upgrade to keep going.", {
        credits: state.credits,
        needed: cost,
      }),
    };
  }
  return { ok: true, state };
}

/** Deduct credits after a billable action succeeds. Returns the new balance, or null if it could not be charged. */
export async function spendCredits(
  userId: string,
  amount: number,
  reason: string,
  ref?: string,
): Promise<number | null> {
  if (amount <= 0) return null;
  const db = createAdminClient();
  const { data, error } = await db.rpc("spend_credits", {
    p_user: userId,
    p_amount: Math.round(amount),
    p_reason: reason,
    p_ref: ref ?? null,
  });
  if (error) {
    console.error("[billing] spend_credits failed", error.message);
    return null;
  }
  return typeof data === "number" && data >= 0 ? data : null;
}

export async function grantCredits(
  userId: string,
  bucket: "plan" | "topup",
  amount: number,
  reason: string,
  ref: string | null,
  reset = false,
): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("grant_credits", {
    p_user: userId,
    p_bucket: bucket,
    p_amount: Math.round(amount),
    p_reason: reason,
    p_ref: ref,
    p_reset: reset,
  });
  if (error) throw new Error(`grant_credits failed: ${error.message}`);
  return typeof data === "number" ? data : 0;
}

export function monthlyCreditsFor(plan: PlanKey): number {
  return PLANS[plan].creditsPerMonth;
}
