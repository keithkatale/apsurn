import { createAdminClient } from "@/lib/supabase/admin";
import { grantCreditsOnce, grantPlanCycleCredits, grantStarterCreditsIfNew } from "@/lib/billing/grants";
import {
  PLANS,
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

function metadataUserId(data: JsonRecord): string | null {
  const meta = asRecord(data.metadata);
  return asString(meta.user_id) ?? asString(meta.userId);
}

async function resolveUserId(data: JsonRecord): Promise<string | null> {
  const fromMeta = metadataUserId(data);
  if (fromMeta) return fromMeta;

  const db = createAdminClient();
  const customer = asRecord(data.customer);
  const customerId = asString(customer.customer_id) ?? asString(data.customer_id);
  if (customerId) {
    const { data: row } = await db
      .from("billing_customers")
      .select("user_id")
      .eq("dodo_customer_id", customerId)
      .maybeSingle();
    if (row?.user_id) return row.user_id;
  }

  const email = asString(customer.email) ?? asString(data.email);
  if (email) {
    const { data: row } = await db
      .from("billing_customers")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();
    if (row?.user_id) return row.user_id;
  }

  return null;
}

async function upsertCustomer(userId: string, data: JsonRecord) {
  const customer = asRecord(data.customer);
  const customerId = asString(customer.customer_id) ?? asString(data.customer_id);
  if (!customerId) return;
  const email = asString(customer.email);
  const db = createAdminClient();
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

async function upsertSubscription(userId: string, data: JsonRecord, statusOverride?: string) {
  const db = createAdminClient();
  const subscriptionId =
    asString(data.subscription_id) ?? asString(asRecord(data.subscription).subscription_id);
  const productId = asString(data.product_id) ?? asString(asRecord(data.product).product_id);
  if (!subscriptionId || !productId) return;

  const planKey = planKeyFromProductId(productId) ?? (asString(asRecord(data.metadata).plan_key) as PlanKey | null);
  if (!planKey) {
    console.warn("[billing] unknown product on subscription", productId);
    return;
  }

  const status = statusOverride ?? asString(data.status) ?? "active";
  const trialEndsAt = asString(data.trial_period_ends_at) ?? asString(data.trial_ends_at);
  const periodEnd = asString(data.next_billing_date) ?? asString(data.current_period_end);

  await db.from("billing_subscriptions").upsert(
    {
      user_id: userId,
      dodo_subscription_id: subscriptionId,
      dodo_product_id: productId,
      plan_key: planKey,
      status,
      trial_ends_at: trialEndsAt,
      current_period_end: periodEnd,
      cancel_at_next_billing_date: Boolean(data.cancel_at_next_billing_date),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "dodo_subscription_id" },
  );

  return { planKey, productId, subscriptionId, status };
}

export async function handleDodoWebhookEvent(payload: {
  type?: string;
  data?: unknown;
  business_id?: string;
}): Promise<void> {
  const type = payload.type ?? "";
  const data = asRecord(payload.data);
  const userId = await resolveUserId(data);
  if (!userId) {
    console.warn("[billing] webhook without user_id", type);
    return;
  }

  await upsertCustomer(userId, data);

  switch (type) {
    case "subscription.active": {
      const sub = await upsertSubscription(userId, data, "active");
      if (sub) await grantStarterCreditsIfNew(userId, sub.subscriptionId);
      break;
    }
    case "subscription.renewed": {
      const sub = await upsertSubscription(userId, data, "active");
      if (sub) {
        const amount = creditsFromProductId(sub.productId);
        const period = asString(data.next_billing_date) ?? asString(data.previous_billing_date) ?? "renewal";
        if (amount) {
          await grantCreditsOnce({
            userId,
            amount,
            reason: "plan_renewal",
            ref: `${sub.subscriptionId}:plan_renewal:${period}`,
            metadata: { product_id: sub.productId },
          });
        }
      }
      break;
    }
    case "subscription.on_hold":
      await upsertSubscription(userId, data, "on_hold");
      break;
    case "subscription.failed":
      await upsertSubscription(userId, data, "failed");
      break;
    case "subscription.cancelled":
      await upsertSubscription(userId, data, "cancelled");
      break;
    case "subscription.expired":
      await upsertSubscription(userId, data, "expired");
      break;
    case "payment.succeeded": {
      const paymentId = asString(data.payment_id) ?? asString(data.invoice_id);
      const meta = asRecord(data.metadata);
      const cyclePlan = asString(meta.plan_key) as PlanKey | null;
      if (asString(meta.kind) === "plan_cycle" && paymentId && cyclePlan && PLANS[cyclePlan]) {
        await grantPlanCycleCredits(userId, cyclePlan, paymentId);
        break;
      }
      if (paymentId) {
        const db = createAdminClient();
        const { data: requested } = await db
          .from("credit_ledger")
          .select("metadata")
          .eq("user_id", userId)
          .eq("reason", "plan_charge_requested")
          .contains("metadata", { payment_id: paymentId })
          .limit(1)
          .maybeSingle();
        const requestedPlan = asString(asRecord(requested?.metadata).plan_key) as PlanKey | null;
        if (requestedPlan && PLANS[requestedPlan]) {
          await grantPlanCycleCredits(userId, requestedPlan, paymentId);
          break;
        }
      }

      // One-time top-ups land here with product_id in cart / payment
      const productId =
        asString(data.product_id) ??
        asString(asRecord((data.product_cart as unknown[])?.[0]).product_id) ??
        asString(asRecord(data.product).product_id);
      if (productId && creditsFromProductId(productId) && !planKeyFromProductId(productId) && paymentId) {
        await grantCreditsOnce({
          userId,
          amount: creditsFromProductId(productId) ?? 0,
          reason: "topup",
          ref: paymentId,
          metadata: { product_id: productId },
        });
      }
      break;
    }
    case "payment.failed": {
      const paymentId = asString(data.payment_id);
      const meta = asRecord(data.metadata);
      if (paymentId && asString(meta.kind) === "plan_cycle") {
        const db = createAdminClient();
        const { data: credits } = await db.from("credit_balances").select("balance").eq("user_id", userId).maybeSingle();
        await db.from("credit_ledger").insert({
          user_id: userId,
          delta: 0,
          balance_after: credits?.balance ?? 0,
          reason: "plan_charge_failed",
          metadata: { payment_id: paymentId, plan_key: asString(meta.plan_key) },
        });
      }
      break;
    }
    default:
      break;
  }
}
