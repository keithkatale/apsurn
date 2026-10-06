import { createAdminClient } from "@/lib/supabase/admin";
import { requestPlanCharge } from "@/lib/billing/charge-plan";

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

function codedError(message: string, code: string): Error {
  const err = new Error(message);
  (err as Error & { code: string }).code = code;
  return err;
}

/** The RPC isn't there until migration 0030 is applied; until then fall back to the legacy read-then-write path. */
function rpcMissing(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "PGRST202" || /could not find the function/i.test(error.message ?? "")));
}

/**
 * Atomic spend via the spend_credits RPC (migration 0030): the balance check
 * and decrement are one statement, and an optional agent task budget is
 * charged in the same transaction.
 */
async function spendAtomically(params: {
  userId: string;
  amount: number;
  action: string;
  metadata?: Record<string, unknown>;
  taskId?: string;
}): Promise<number | null> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("spend_credits", {
    p_user: params.userId,
    p_amount: params.amount,
    p_action: params.action,
    p_metadata: params.metadata ?? {},
    p_task: params.taskId ?? null,
  });
  if (rpcMissing(error)) return null;
  if (error) {
    const hint = (error as { hint?: string }).hint;
    if (hint === "credits_exhausted") throw codedError("Not enough credits. Buy a top-up or upgrade your plan.", "credits_exhausted");
    if (hint === "budget_exhausted") throw codedError("This task reached its credit budget.", "budget_exhausted");
    throw new Error(error.message);
  }
  return typeof data === "number" ? data : Number(data ?? 0);
}

export async function spendCredits(params: {
  userId: string;
  amount: number;
  action: string;
  metadata?: Record<string, unknown>;
  /** Charge this agent task's approved budget too; throws code "budget_exhausted" past it. */
  taskId?: string;
}): Promise<number> {
  if (params.amount <= 0) return (await adjustCredits({ userId: params.userId, delta: 0, reason: "noop" })) || 0;
  try {
    const atomic = await spendAtomically(params);
    const next =
      atomic ??
      (await adjustCredits({
        userId: params.userId,
        delta: -params.amount,
        reason: "spend",
        action: params.action,
        metadata: params.metadata,
      }));
    if (next === 0) {
      await requestPlanCharge(params.userId);
    }
    return next;
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === "credits_exhausted") {
      const charging = await requestPlanCharge(params.userId);
      if (charging) {
        const err = new Error(
          "Your free credits are used up. Your card is being charged for your plan — try again in a moment.",
        );
        (err as Error & { code: string }).code = "credits_exhausted";
        throw err;
      }
    }
    throw error;
  }
}

export async function grantCredits(params: {
  userId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
}): Promise<number> {
  if (params.amount <= 0) return 0;
  const db = createAdminClient();
  const { data, error } = await db.rpc("grant_credits", {
    p_user: params.userId,
    p_amount: params.amount,
    p_reason: params.reason,
    p_metadata: params.metadata ?? {},
  });
  if (!error) return typeof data === "number" ? data : Number(data ?? 0);
  if (!rpcMissing(error)) throw new Error(error.message);
  return adjustCredits({
    userId: params.userId,
    delta: params.amount,
    reason: params.reason,
    metadata: params.metadata,
  });
}
