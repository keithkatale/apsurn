import { createAdminClient } from "@/lib/supabase/admin";
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

async function grantPlanCreditsOnce(userId: string, productId: string, reason: string, ref: string) {
  const amount = creditsFromProductId(productId);
  if (!amount) return;

  const db = createAdminClient();
  const { data: existing } = await db
    .from("credit_ledger")
    .select("id")
    .eq("user_id", userId)
    .eq("reason", reason)
    .contains("metadata", { ref })
    .limit(1)
    .maybeSingle();
  if (existing) return;

  await grantCredits({
    userId,
    amount,
    reason,
    metadata: { product_id: productId, ref },
  });
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
    case "subscription.active":
    case "subscription.renewed": {
      const sub = await upsertSubscription(userId, data, "active");
      if (sub) {
        const reason = type === "subscription.renewed" ? "plan_renewal" : "plan_activation";
        await grantPlanCreditsOnce(userId, sub.productId, reason, sub.subscriptionId + ":" + reason);
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
      // One-time top-ups land here with product_id in cart / payment
      const productId =
        asString(data.product_id) ??
        asString(asRecord((data.product_cart as unknown[])?.[0]).product_id) ??
        asString(asRecord(data.product).product_id);
      if (productId && creditsFromProductId(productId) && !planKeyFromProductId(productId)) {
        const paymentId = asString(data.payment_id) ?? asString(data.invoice_id) ?? productId;
        await grantPlanCreditsOnce(userId, productId, "topup", paymentId);
      }
      break;
    }
    default:
      break;
  }
}
