import { Webhooks } from "@dodopayments/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleDodoWebhookEvent } from "@/lib/billing/webhooks";

/** Standard Webhooks needs a base64 secret at module load; keep a valid stub when unset so `next build` can collect page data. */
function webhookSigningKey(): string {
  const key = process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim();
  if (key) return key;
  return Buffer.from("apsurn-dev-webhook-placeholder-key!").toString("base64");
}

export const POST = Webhooks({
  webhookKey: webhookSigningKey(),
  onPayload: async (payload) => {
    const webhookId =
      (payload as { webhook_id?: string }).webhook_id ||
      `${payload.type}:${(payload.data as { subscription_id?: string; payment_id?: string } | undefined)?.subscription_id || (payload.data as { payment_id?: string } | undefined)?.payment_id || Date.now()}`;

    const db = createAdminClient();
    const { error } = await db.from("billing_webhook_events").insert({
      webhook_id: String(webhookId),
      event_type: payload.type ?? "unknown",
    });
    // Unique violation → already processed
    if (error?.code === "23505") return;

    await handleDodoWebhookEvent(payload);
  },
});
