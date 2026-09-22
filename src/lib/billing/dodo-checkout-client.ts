"use client";

import { DodoPayments } from "dodopayments-checkout";
import { notifyCreditsChanged } from "@/components/billing/CreditsBalance";

let initialized = false;

/** Initialize Dodo overlay checkout once; refresh credit meter when checkout ends. */
export function ensureDodoCheckout() {
  if (initialized || typeof window === "undefined") return;
  DodoPayments.Initialize({
    mode:
      process.env.NEXT_PUBLIC_DODO_PAYMENTS_ENVIRONMENT === "live" ||
      process.env.NEXT_PUBLIC_DODO_PAYMENTS_ENVIRONMENT === "live_mode"
        ? "live"
        : "test",
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
  initialized = true;
}
