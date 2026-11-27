/**
 * Apsurn billing catalog — Dodo product IDs + credit allotments.
 * A plan is charged at checkout and its full monthly credits are granted immediately (14-day money-back guarantee).
 * The free setup preview is 10 contacts, which is 50 credits at 5 credits per contact.
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

/** Leads allowed during setup before an active subscription. 10 contacts x 5 credits = the 50 free credits. */
export const SETUP_FREE_LEAD_CAP = 10;

/** Refund window for a first plan payment. Refunds are handled by email (see the Terms). */
export const MONEY_BACK_DAYS = 14;
export const SUPPORT_EMAIL = "keith@apsurn.com";

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
    description: "For founders starting outbound. $30 today, 2,000 credits right away, 14-day money-back guarantee.",
    features: [
      "2,000 credits every month, available immediately",
      "About 400 contacts a month (5 credits each)",
      "Personalized email drafts",
      "Campaign sequences",
      "Lead enrichment",
    ],
    highlight: true,
    productId: {
      // Subscription products. Checkout saves a card (mandate only) and does not charge the trial.
      test: "pdt_0Nsffee9U7dS2kaMcaJuF",
      live: "pdt_0NoAYsFpAjLoZGvfAPzag",
    },
  },
  growth: {
    key: "growth",
    name: "Growth",
    priceUsd: 79,
    creditsPerMonth: 8_000,
    description: "For teams running outbound every week. $79 today, 8,000 credits right away, 14-day money-back guarantee.",
    highlight: false,
    features: [
      "8,000 credits every month, available immediately",
      "About 1,600 contacts a month (5 credits each)",
      "Everything in Startup",
      "Higher prospecting volume",
      "Priority AI throughput",
    ],
    productId: {
      test: "pdt_0NsffvHtSMWjrXYR4DSAe",
      live: "pdt_0NoAYve6K77SbtvcG39xw",
    },
  },
  pro: {
    key: "pro",
    name: "Pro",
    priceUsd: 149,
    creditsPerMonth: 20_000,
    description: "For power users and agencies. $149 today, 20,000 credits right away, 14-day money-back guarantee.",
    features: [
      "20,000 credits every month, available immediately",
      "About 4,000 contacts a month (5 credits each)",
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
  // Setup (business blueprint, competitor scan, campaign drafts) is free so the credits go to what people came for:
  // contacts. 10 contacts at 5 credits each use the 50 free credits inside the first session.
  campaign_generate: 0,
  blueprint_generate: 0,
  market_scan: 0,
  copilot_turn: 2,
  /** One verified contact. */
  prospect_company: 5,
  /** One sourcing pass (registry, page, or social search) before any rows are saved. */
  lead_source_scan: 8,
  /** Extra when a scan also searches LinkedIn (a paid Apify run, up to 30 posts). */
  linkedin_scan: 6,
  /** Each buying-intent signal kept in the feed after a scan. */
  signal_kept: 1,
  /** Auto-source enrichment (Icypeas, email verification) for one radar signal. */
  radar_auto_source: 8,
} as const;

/**
 * One-time unlock: a visitor pays $1 once and gets $30 of sending credits (2,000 credits, the Startup allowance).
 * Create a one-time $1 product in Dodo and set DODO_UNLOCK_PRODUCT_ID (test) / DODO_UNLOCK_PRODUCT_ID_LIVE (live).
 */
export const UNLOCK = { priceUsd: 1, creditsValueUsd: 30, credits: 2_000 } as const;

/** What one contact costs, stated everywhere so nobody is surprised. Priced at the Startup rate ($30 / 2,000 credits). */
export const CONTACT_CREDITS = CREDIT_COSTS.prospect_company;
export const CONTACT_COST_USD = (CONTACT_CREDITS * 30) / 2_000;
export const contactCostLabel = () => `1 contact = ${CONTACT_CREDITS} credits (about $${CONTACT_COST_USD.toFixed(2)})`;

export function unlockProductId(): string | null {
  const id = isLiveBilling() ? process.env.DODO_UNLOCK_PRODUCT_ID_LIVE : process.env.DODO_UNLOCK_PRODUCT_ID;
  return id?.trim() || null;
}

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
