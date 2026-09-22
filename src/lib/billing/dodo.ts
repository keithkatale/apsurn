import DodoPayments from "dodopayments";

export function dodoEnvironment(): "test_mode" | "live_mode" {
  return process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode";
}

export function getDodoClient(): DodoPayments {
  const bearerToken = process.env.DODO_PAYMENTS_API_KEY?.trim();
  if (!bearerToken) {
    throw new Error("DODO_PAYMENTS_API_KEY is not configured");
  }
  return new DodoPayments({
    bearerToken,
    environment: dodoEnvironment(),
    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim() || undefined,
  });
}

export function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
