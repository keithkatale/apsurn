import DodoPayments from "dodopayments";

export function dodoEnvironment(): "test_mode" | "live_mode" {
  return process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode";
}

/** Live checkout must use the live key. The default key is the test key and is rejected by the live API. */
export function dodoBearerToken(input?: {
  environment?: string;
  apiKey?: string | null;
  liveApiKey?: string | null;
}): string {
  const environment = input?.environment ?? process.env.DODO_PAYMENTS_ENVIRONMENT;
  const apiKey = (input?.apiKey ?? process.env.DODO_PAYMENTS_API_KEY)?.trim() ?? "";
  const liveApiKey = (input?.liveApiKey ?? process.env.DODO_PAYMENTS_LIVE_API_KEY)?.trim() ?? "";
  if (environment === "live_mode") {
    if (!liveApiKey) throw new Error("DODO_PAYMENTS_LIVE_API_KEY is not configured");
    return liveApiKey;
  }
  if (!apiKey) throw new Error("DODO_PAYMENTS_API_KEY is not configured");
  return apiKey;
}

export function getDodoClient(): DodoPayments {
  return new DodoPayments({
    bearerToken: dodoBearerToken(),
    environment: dodoEnvironment(),
    // Honor `environment`. A base URL left in the process would point the live key at the test API.
    baseURL: null,
    webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim() || undefined,
  });
}

export function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}
