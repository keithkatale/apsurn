import { getCurrentUserId } from "@/lib/auth/session";
import { creditCost, getBillingState, requirePaidCredits, spendCredits, type CreditAction } from "@/lib/billing/credits";

/**
 * Setup actions are free for everyone (that's the free setup experience, capped elsewhere),
 * but charge credits when the person has an active plan. The first step is `begin`, the
 * second is `settle` once the action succeeded, so a failed AI call never costs credits.
 */
export type SetupGate =
  | { blocked: Response }
  | { blocked?: undefined; userId: string | null; paid: boolean; credits: number };

export async function beginSetupAction(action: CreditAction, units = 1): Promise<SetupGate> {
  let userId: string | null = null;
  try {
    userId = await getCurrentUserId();
  } catch {
    return { userId: null, paid: false, credits: 0 };
  }
  const state = await getBillingState(userId);
  if (!state.active) return { userId, paid: false, credits: state.credits };

  const gate = await requirePaidCredits(userId, creditCost(action, units));
  if (!gate.ok) return { blocked: gate.response };
  return { userId, paid: true, credits: gate.state.credits };
}

export async function settleSetupAction(gate: SetupGate, action: CreditAction, units = 1): Promise<void> {
  if (gate.blocked || !gate.paid || !gate.userId) return;
  await spendCredits(gate.userId, creditCost(action, units), action);
}
