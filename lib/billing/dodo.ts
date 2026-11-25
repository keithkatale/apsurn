import DodoPayments from "dodopayments";
import { UNLOCK, dodoBrandId, isLiveBilling, unlockProductId } from "@/lib/billing/plans";

let client: DodoPayments | null = null;

export function isDodoConfigured(): boolean {
  return Boolean(process.env.DODO_PAYMENTS_API_KEY?.trim());
}

/** Server-only Dodo client. Test/live mode follows DODO_PAYMENTS_ENVIRONMENT. */
export function getDodo(): DodoPayments {
  if (!isDodoConfigured()) {
    throw new Error("Dodo Payments is not configured. Set DODO_PAYMENTS_API_KEY.");
  }
  if (!client) {
    client = new DodoPayments({
      bearerToken: process.env.DODO_PAYMENTS_API_KEY!.trim(),
      environment: isLiveBilling() ? "live_mode" : "test_mode",
      webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim() || null,
    });
  }
  return client;
}

const UNLOCK_PRODUCT_NAME = "Apsurn sending credits unlock";
let unlockProductPromise: Promise<string> | null = null;

/**
 * Checkout sessions can only sell existing products, so the one-time unlock product is created through the API the
 * first time it is needed (and found again by name afterwards). An env var still wins if you want to pin one.
 */
export function ensureUnlockProductId(): Promise<string> {
  const pinned = unlockProductId();
  if (pinned) return Promise.resolve(pinned);
  if (!unlockProductPromise) {
    unlockProductPromise = (async () => {
      const dodo = getDodo();
      for await (const product of dodo.products.list({ page_size: 100 })) {
        if (product.name === UNLOCK_PRODUCT_NAME && !product.is_recurring) return product.product_id;
      }
      const created = await dodo.products.create({
        name: UNLOCK_PRODUCT_NAME,
        description: `One-time unlock for ${UNLOCK.creditsValueUsd} dollars of sending credits.`,
        price: {
          type: "one_time_price",
          currency: "USD",
          price: UNLOCK.priceUsd * 100,
          discount: 0,
          purchasing_power_parity: false,
        },
        tax_category: "saas",
        brand_id: dodoBrandId(),
      });
      return created.product_id;
    })().catch((error) => {
      unlockProductPromise = null;
      throw error;
    });
  }
  return unlockProductPromise;
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}
