import { createAdminClient } from "@/lib/supabase/admin";
import type { PlanKey } from "@/lib/billing/plans";

export type BillingStatus = {
  active: boolean;
  planKey: PlanKey | null;
  status: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  creditBalance: number;
  cancelAtNextBillingDate: boolean;
};

export async function getBillingStatus(userId: string): Promise<BillingStatus> {
  const db = createAdminClient();
  const [{ data: sub }, { data: credits }] = await Promise.all([
    db
      .from("billing_subscriptions")
      .select("plan_key, status, trial_ends_at, current_period_end, cancel_at_next_billing_date")
      .eq("user_id", userId)
      .in("status", ["active", "on_hold"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("credit_balances").select("balance").eq("user_id", userId).maybeSingle(),
  ]);

  const active = sub?.status === "active";
  return {
    active,
    planKey: (sub?.plan_key as PlanKey | undefined) ?? null,
    status: sub?.status ?? null,
    trialEndsAt: sub?.trial_ends_at ?? null,
    currentPeriodEnd: sub?.current_period_end ?? null,
    creditBalance: credits?.balance ?? 0,
    cancelAtNextBillingDate: Boolean(sub?.cancel_at_next_billing_date),
  };
}

export async function requireActiveBilling(userId: string): Promise<BillingStatus> {
  const status = await getBillingStatus(userId);
  if (!status.active) {
    const err = new Error("Start a 7-day trial ($1) to use AI and send email.");
    (err as Error & { code: string }).code = "billing_required";
    throw err;
  }
  return status;
}
