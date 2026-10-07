/**
 * Apsurn billing catalog — Dodo product IDs + credit allotments.
 * A new plan saves a card and starts with 50 free credits.
 * The plan price is charged when those credits run out.
 */

export type PlanKey = "startup" | "growth" | "pro";

/** Plans a new customer can start. Pro stays in the catalog for existing subscriptions. */
export const OFFERED_PLAN_KEYS = ["growth", "startup"] as const satisfies readonly PlanKey[];
export type TopupKey = "credits_500" | "credits_2000";

export type PlanDefinition = {
  key: PlanKey;
  name: string;
  priceUsd: number;
  creditsPerMonth: number;
  description: string;
  features: string[];
  highlight?: boolean;
  productId: { test: string; live: string };
};

export type TopupDefinition = {
  key: TopupKey;
  name: string;
  priceUsd: number;
  credits: number;
  productId: { test: string; live: string };
};

/** Marketing-only. Enterprise is scoped on a call and is not a checkout product. */
export const ENTERPRISE_PLAN = {
  name: "Done-with-you sprint",
  priceUsd: 833,
  description: "I run your first outbound campaign with you.",
  features: [
    "Your ICP defined and tested",
    "75–100 researched accounts",
    "Two messaging angles tested",
    "Weekly findings and a final playbook",
  ],
  bookingUrl: "https://cal.com/keith-katale/30min",
} as const;

/**
 * Free credits issued when a card is saved. 50 AI credits, worth $1 at the
 * $40 / 2,000 top-up rate.
 */
export const STARTER_CREDIT_USD = 1;
export const STARTER_CREDITS = 50;
/** Charged once when a card is saved, so the free credit grant can start. */
export const ACTIVATION_FEE_USD = 1;

/** Leads allowed during setup before an active subscription. */
export const SETUP_FREE_LEAD_CAP = 10;

/** Dodo Payments brand — checkout / receipts show as Apsurn. */
export const DODO_BRAND_ID = {
  test: "brnd_0NlK8ZY9Imdh4mTInZFez",
  live: "brnd_0NmDFcqvFfzjM5GSbJ9WM",
} as const;

export function dodoBrandId(): string {
  return isLiveBilling() ? DODO_BRAND_ID.live : DODO_BRAND_ID.test;
}

export const PLANS: Record<PlanKey, PlanDefinition> = {
  startup: {
    key: "startup",
    name: "Startup",
    priceUsd: 30,
    creditsPerMonth: 2_000,
    description: "For founders starting outbound. 50 free credits, then $30 when those credits run out.",
    features: [
      "50 free credits to start",
      "2,000 AI credits after your card is charged",
      "Personalized email drafts",
      "Campaign sequences",
      "Lead enrichment",
    ],
    highlight: true,
    productId: {
      // Subscription products. Checkout saves a card (mandate only) and does not charge the trial.
      test: "pdt_0NoAYvskQ1M4UjDv03ivE",
      live: "pdt_0NoAYsFpAjLoZGvfAPzag",
    },
  },
  growth: {
    key: "growth",
    name: "Growth",
    priceUsd: 79,
    creditsPerMonth: 8_000,
    description: "For teams running outbound every week. 50 free credits, then $79 when those credits run out.",
    highlight: false,
    features: [
      "50 free credits to start",
      "8,000 AI credits after your card is charged",
      "Everything in Startup",
      "Higher prospecting volume",
      "Priority AI throughput",
    ],
    productId: {
      test: "pdt_0NoAYvzgGaMeY7tcvFWpv",
      live: "pdt_0NoAYve6K77SbtvcG39xw",
    },
  },
  pro: {
    key: "pro",
    name: "Pro",
    priceUsd: 149,
    creditsPerMonth: 20_000,
    description: "For power users and agencies. 50 free credits, then $149 when those credits run out.",
    features: [
      "50 free credits to start",
      "20,000 AI credits after your card is charged",
      "Everything in Growth",
      "Best for multi-campaign volume",
      "Credit top-ups available in-app",
    ],
    productId: {
      test: "pdt_0NoAYw3qfKvVdbpMwH6zn",
      live: "pdt_0NoAYvl6kNKJh2ft72lZR",
    },
  },
};

export const TOPUPS: Record<TopupKey, TopupDefinition> = {
  credits_500: {
    key: "credits_500",
    name: "500 credits",
    priceUsd: 15,
    credits: 500,
    productId: {
      test: "pdt_0NoAWsuDXHBUgIhUQwp8R",
      live: "pdt_0NoAWm8tVgzdwp4hPvR0N",
    },
  },
  credits_2000: {
    key: "credits_2000",
    name: "2,000 credits",
    priceUsd: 40,
    credits: 2_000,
    productId: {
      test: "pdt_0NoAWt1FRu2cphqMkPPO7",
      live: "pdt_0NoAWmFOD39ykSGhzLWzH",
    },
  },
};

/** Credit costs for billable AI / data actions. */
export const CREDIT_COSTS = {
  email_draft: 1,
  email_find: 5,
  campaign_generate: 25,
  blueprint_generate: 20,
  market_scan: 15,
  copilot_turn: 2,
  prospect_company: 3,
  /** One sourcing pass (registry, page, or social search) before any rows are saved. */
  lead_source_scan: 8,
} as const;

export function isLiveBilling(): boolean {
  return process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode";
}

export function productIdForPlan(plan: PlanKey): string {
  const env = isLiveBilling() ? "live" : "test";
  return PLANS[plan].productId[env];
}

export function productIdForTopup(topup: TopupKey): string {
  const env = isLiveBilling() ? "live" : "test";
  return TOPUPS[topup].productId[env];
}

export function planKeyFromProductId(productId: string): PlanKey | null {
  for (const plan of Object.values(PLANS)) {
    if (plan.productId.test === productId || plan.productId.live === productId) {
      return plan.key;
    }
  }
  return null;
}

export function creditsFromProductId(productId: string): number | null {
  for (const plan of Object.values(PLANS)) {
    if (plan.productId.test === productId || plan.productId.live === productId) {
      return plan.creditsPerMonth;
    }
  }
  for (const topup of Object.values(TOPUPS)) {
    if (topup.productId.test === productId || topup.productId.live === productId) {
      return topup.credits;
    }
  }
  return null;
}

export function topupKeyFromProductId(productId: string): TopupKey | null {
  for (const topup of Object.values(TOPUPS)) {
    if (topup.productId.test === productId || topup.productId.live === productId) {
      return topup.key;
    }
  }
  return null;
}
