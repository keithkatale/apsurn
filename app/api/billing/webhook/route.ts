import { grantCredits, monthlyCreditsFor } from "@/lib/billing/credits";
import { getDodo, isDodoConfigured } from "@/lib/billing/dodo";
import { STARTER_CREDITS, TOPUPS, UNLOCK, planKeyFromProductId, type PlanKey, type TopupKey } from "@/lib/billing/plans";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** The subset of Dodo's subscription / payment payloads this handler reads. */
type Payload = {
  subscription_id?: string;
  payment_id?: string;
  product_id?: string;
  status?: string;
  metadata?: Record<string, string> | null;
  customer?: { customer_id?: string } | null;
  next_billing_date?: string | null;
  cancel_at_next_billing_date?: boolean | null;
  trial_period_days?: number | null;
};

async function resolveUserId(data: Payload): Promise<string | null> {
  const fromMeta = data.metadata?.user_id;
  if (fromMeta) return fromMeta;
  const db = createAdminClient();
  if (data.subscription_id) {
    const { data: row } = await db
      .from("billing_accounts")
      .select("user_id")
      .eq("subscription_id", data.subscription_id)
      .maybeSingle();
    if (row?.user_id) return row.user_id as string;
  }
  const customerId = data.customer?.customer_id;
  if (customerId) {
    const { data: row } = await db
      .from("billing_accounts")
      .select("user_id")
      .eq("dodo_customer_id", customerId)
      .maybeSingle();
    if (row?.user_id) return row.user_id as string;
  }
  return null;
}

async function saveAccount(userId: string, fields: Record<string, unknown>) {
  const db = createAdminClient();
  const { error } = await db
    .from("billing_accounts")
    .upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(`billing_accounts upsert failed: ${error.message}`);
}

function subscriptionFields(data: Payload, status: string) {
  return {
    ...(data.customer?.customer_id ? { dodo_customer_id: data.customer.customer_id } : {}),
    ...(data.subscription_id ? { subscription_id: data.subscription_id } : {}),
    subscription_status: status,
    current_period_end: data.next_billing_date ?? null,
    cancel_at_period_end: Boolean(data.cancel_at_next_billing_date),
  };
}

async function handleEvent(type: string, data: Payload, webhookId: string) {
  switch (type) {
    case "subscription.active": {
      const userId = await resolveUserId(data);
      const plan = data.product_id ? planKeyFromProductId(data.product_id) : null;
      if (!userId || !plan || !data.subscription_id) {
        console.warn("[billing] subscription.active: could not map event", { userId, plan, sub: data.subscription_id });
        return;
      }
      await saveAccount(userId, { ...subscriptionFields(data, "active"), plan_key: plan });
      // Trial: starter credits. No trial: the first charge already happened, so grant the full month.
      const onTrial = (data.trial_period_days ?? 0) > 0;
      await grantCredits(
        userId,
        "plan",
        onTrial ? STARTER_CREDITS : monthlyCreditsFor(plan),
        onTrial ? "trial_start" : "plan_start",
        `sub-start:${data.subscription_id}`,
        true,
      );
      return;
    }

    case "subscription.renewed": {
      const userId = await resolveUserId(data);
      const plan = data.product_id ? planKeyFromProductId(data.product_id) : null;
      if (!userId || !plan || !data.subscription_id) return;
      await saveAccount(userId, { ...subscriptionFields(data, "active"), plan_key: plan });
      // New cycle: plan credits reset to the monthly allowance (no rollover). Top-ups are untouched.
      await grantCredits(
        userId,
        "plan",
        monthlyCreditsFor(plan),
        "plan_renewal",
        `sub-renew:${data.subscription_id}:${data.next_billing_date ?? webhookId}`,
        true,
      );
      return;
    }

    case "subscription.plan_changed": {
      const userId = await resolveUserId(data);
      const plan = data.product_id ? planKeyFromProductId(data.product_id) : null;
      if (!userId || !plan) return;
      const db = createAdminClient();
      const { data: before } = await db.from("billing_accounts").select("plan_key").eq("user_id", userId).maybeSingle();
      await saveAccount(userId, { ...subscriptionFields(data, data.status ?? "active"), plan_key: plan });
      const previous = before?.plan_key as PlanKey | undefined;
      const diff = previous ? monthlyCreditsFor(plan) - monthlyCreditsFor(previous) : 0;
      // Upgrade: top up the allowance by the difference now. Downgrade: new allowance applies at renewal.
      if (diff > 0) await grantCredits(userId, "plan", diff, "plan_upgrade", `sub-change:${webhookId}`);
      return;
    }

    case "subscription.updated":
    case "subscription.on_hold":
    case "subscription.past_due":
    case "subscription.paused":
    case "subscription.unpaused": {
      const userId = await resolveUserId(data);
      if (!userId) return;
      const status =
        data.status ??
        ({
          "subscription.on_hold": "on_hold",
          "subscription.past_due": "past_due",
          "subscription.paused": "paused",
          "subscription.unpaused": "active",
          "subscription.updated": "active",
        } as Record<string, string>)[type];
      await saveAccount(userId, subscriptionFields(data, status));
      return;
    }

    case "subscription.cancelled":
    case "subscription.expired":
    case "subscription.failed": {
      const userId = await resolveUserId(data);
      if (!userId) return;
      const status = type.split(".")[1];
      await saveAccount(userId, subscriptionFields(data, status));
      // Subscription is over: the monthly allowance goes with it. Purchased top-ups are kept.
      await grantCredits(userId, "plan", 0, `plan_${status}`, `sub-end:${webhookId}`, true);
      return;
    }

    case "payment.succeeded": {
      // Subscription charges also arrive here; only credit top-ups matter.
      if (data.metadata?.kind === "unlock") {
        const unlockUser = await resolveUserId(data);
        if (!unlockUser || !data.payment_id) return;
        await grantCredits(unlockUser, "topup", UNLOCK.credits, "unlock", `unlock:${data.payment_id}`);
        return;
      }
      if (data.metadata?.kind !== "topup") return;
      const userId = await resolveUserId(data);
      const key = data.metadata?.topup_key as TopupKey | undefined;
      if (!userId || !key || !TOPUPS[key] || !data.payment_id) return;
      await grantCredits(userId, "topup", TOPUPS[key].credits, "topup", `topup:${data.payment_id}`);
      return;
    }

    default:
      return;
  }
}

export async function POST(req: Request) {
  if (!isDodoConfigured() || !process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim()) {
    return Response.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  const body = await req.text();
  const headers = {
    "webhook-id": req.headers.get("webhook-id") ?? "",
    "webhook-signature": req.headers.get("webhook-signature") ?? "",
    "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
  };

  let event: { type: string; data: Payload };
  try {
    // Verifies the signature; throws on a bad one.
    event = getDodo().webhooks.unwrap(body, {
      headers,
      key: process.env.DODO_PAYMENTS_WEBHOOK_KEY!.trim(),
    }) as unknown as { type: string; data: Payload };
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    await handleEvent(event.type, event.data, headers["webhook-id"]);
    return Response.json({ received: true });
  } catch (error) {
    // 5xx makes Dodo retry. Every credit grant is idempotent, so retries are safe.
    console.error("[billing] webhook failed", event.type, error);
    return Response.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}
