import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Grant or spend credits. Positive delta = grant, negative = spend.
 * Throws if spending would go below zero.
 */
export async function adjustCredits(params: {
  userId: string;
  delta: number;
  reason: string;
  action?: string;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  const db = createAdminClient();
  const { userId, delta, reason, action, metadata } = params;

  const { data: existing } = await db
    .from("credit_balances")
    .select("balance, lifetime_granted, lifetime_spent")
    .eq("user_id", userId)
    .maybeSingle();

  const current = existing?.balance ?? 0;
  const next = current + delta;
  if (next < 0) {
    const err = new Error("Not enough credits. Buy a top-up or upgrade your plan.");
    (err as Error & { code: string }).code = "credits_exhausted";
    throw err;
  }

  const lifetimeGranted = (existing?.lifetime_granted ?? 0) + (delta > 0 ? delta : 0);
  const lifetimeSpent = (existing?.lifetime_spent ?? 0) + (delta < 0 ? -delta : 0);

  const { error: upsertError } = await db.from("credit_balances").upsert(
    {
      user_id: userId,
      balance: next,
      lifetime_granted: lifetimeGranted,
      lifetime_spent: lifetimeSpent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (upsertError) throw upsertError;

  const { error: ledgerError } = await db.from("credit_ledger").insert({
    user_id: userId,
    delta,
    balance_after: next,
    reason,
    action: action ?? null,
    metadata: metadata ?? {},
  });
  if (ledgerError) throw ledgerError;

  return next;
}

export async function spendCredits(params: {
  userId: string;
  amount: number;
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  if (params.amount <= 0) return (await adjustCredits({ userId: params.userId, delta: 0, reason: "noop" })) || 0;
  return adjustCredits({
    userId: params.userId,
    delta: -params.amount,
    reason: "spend",
    action: params.action,
    metadata: params.metadata,
  });
}

export async function grantCredits(params: {
  userId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  if (params.amount <= 0) return 0;
  return adjustCredits({
    userId: params.userId,
    delta: params.amount,
    reason: params.reason,
    metadata: params.metadata,
  });
}
