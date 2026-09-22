import { createAdminClient } from "@/lib/supabase/admin";
import { getDodoClient } from "@/lib/billing/dodo";
import { grantCredits } from "@/lib/billing/credits";
import {
  creditsFromProductId,
  planKeyFromProductId,
  type PlanKey,
} from "@/lib/billing/plans";

type JsonRecord = Record<string, unknown>;

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

/**
 * Pull a subscription from Dodo and activate it for the signed-in user.
 * Used when webhooks are delayed/missing (common on localhost) and the
 * checkout return URL includes subscription_id.
 */
export async function syncSubscriptionFromDodo(params: {
  userId: string;
  subscriptionId: string;
  email?: string | null;
}): Promise<{ active: boolean; planKey: PlanKey | null }> {
  const { userId, subscriptionId } = params;
  const client = getDodoClient();
  const sub = (await client.subscriptions.retrieve(subscriptionId)) as unknown as JsonRecord;

  const productId = asString(sub.product_id);
  const status = asString(sub.status) ?? "active";
  const customer = asRecord(sub.customer);
  const customerId = asString(customer.customer_id);
  const email = asString(customer.email) ?? params.email ?? null;
  const meta = asRecord(sub.metadata);
  const metaUserId = asString(meta.user_id);

  // Only attach if metadata matches this user, or metadata is missing (legacy).
  if (metaUserId && metaUserId !== userId) {
    throw new Error("This subscription belongs to a different account.");
  }

  if (!productId) throw new Error("Subscription is missing a product.");

  const planKey =
    planKeyFromProductId(productId) ?? (asString(meta.plan_key) as PlanKey | null);
  if (!planKey) throw new Error("Unknown plan on this subscription.");

  const db = createAdminClient();

  if (customerId) {
    await db.from("billing_customers").upsert(
      {
        user_id: userId,
        dodo_customer_id: customerId,
        email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  const trialEndsAt =
    asString(sub.trial_period_ends_at) ??
    // Paid trials often expose next_billing_date as the first full charge.
    (status === "active" && asString(sub.next_billing_date));
  const periodEnd = asString(sub.next_billing_date) ?? asString(sub.expires_at);

  await db.from("billing_subscriptions").upsert(
    {
      user_id: userId,
      dodo_subscription_id: subscriptionId,
      dodo_product_id: productId,
      plan_key: planKey,
      status,
      trial_ends_at: trialEndsAt,
      current_period_end: periodEnd,
      cancel_at_next_billing_date: Boolean(sub.cancel_at_next_billing_date),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "dodo_subscription_id" },
  );

  if (status === "active") {
    const amount = creditsFromProductId(productId);
    if (amount) {
      const ref = `${subscriptionId}:plan_activation`;
      const { data: existing } = await db
        .from("credit_ledger")
        .select("id")
        .eq("user_id", userId)
        .eq("reason", "plan_activation")
        .contains("metadata", { ref })
        .limit(1)
        .maybeSingle();
      if (!existing) {
        await grantCredits({
          userId,
          amount,
          reason: "plan_activation",
          metadata: { product_id: productId, ref, subscription_id: subscriptionId },
        });
      }
    }
  }

  return { active: status === "active", planKey };
}
