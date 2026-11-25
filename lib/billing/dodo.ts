import DodoPayments from "dodopayments";
import { isLiveBilling } from "@/lib/billing/plans";

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

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}
