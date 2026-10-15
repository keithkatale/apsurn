"use client";

import { DodoPayments } from "dodopayments-checkout";
import { notifyCreditsChanged } from "@/components/billing/CreditsBalance";

let initializedMode: "test" | "live" | null = null;

function envMode(): "test" | "live" {
  return process.env.NEXT_PUBLIC_DODO_PAYMENTS_ENVIRONMENT === "live" ||
    process.env.NEXT_PUBLIC_DODO_PAYMENTS_ENVIRONMENT === "live_mode"
    ? "live"
    : "test";
}

/** The checkout page itself says which environment it is: test sessions live on a test.* host. */
export function modeFromCheckoutUrl(checkoutUrl: string): "test" | "live" | null {
  try {
    const host = new URL(checkoutUrl).hostname.toLowerCase();
    if (!host.endsWith("dodopayments.com")) return null;
    return host.startsWith("test.") ? "test" : "live";
  } catch {
    return null;
  }
}

/**
 * Initialize Dodo overlay checkout; refresh credit meter when checkout ends.
 * The overlay only trusts messages (including "close") from the environment it was initialized for, and
 * NEXT_PUBLIC_* values are fixed at build time while the server picks test or live at runtime. When the two
 * disagree the close button silently does nothing, so the mode is taken from the checkout URL when one is known.
 */
export function ensureDodoCheckout(mode: "test" | "live" = envMode()) {
  if (initializedMode === mode || typeof window === "undefined") return;
  DodoPayments.Initialize({
    mode,
    displayType: "overlay",
    onEvent: (event) => {
      if (event.event_type === "checkout.closed" || event.event_type === "checkout.redirect") {
        // Poll a few times — grants can land slightly after close (webhook / sync).
        notifyCreditsChanged();
        window.setTimeout(() => notifyCreditsChanged(), 1500);
        window.setTimeout(() => notifyCreditsChanged(), 4000);
      }
    },
  });
  initializedMode = mode;
}

/** Open the overlay for a checkout URL the server just created, in the environment that URL belongs to. */
export async function openDodoCheckout(checkoutUrl: string) {
  ensureDodoCheckout(modeFromCheckoutUrl(checkoutUrl) ?? envMode());
  await DodoPayments.Checkout.open({ checkoutUrl });
}
