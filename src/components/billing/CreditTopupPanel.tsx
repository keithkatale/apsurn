"use client";

import { useState } from "react";
import { DodoPayments } from "dodopayments-checkout";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { TOPUPS, type TopupKey } from "@/lib/billing/plans";
import { ensureDodoCheckout } from "@/lib/billing/dodo-checkout-client";

/** In-app credit top-ups (not shown on the public pricing page). */
export function CreditTopupPanel({ className }: { className?: string }) {
  const [busy, setBusy] = useState<TopupKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function buy(topup: TopupKey) {
    setBusy(topup);
    setMessage(null);
    try {
      ensureDodoCheckout();
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topup }),
      });
      const data = (await res.json().catch(() => null)) as { checkoutUrl?: string; error?: string } | null;
      if (!res.ok || !data?.checkoutUrl) throw new Error(data?.error || "Checkout failed");
      await DodoPayments.Checkout.open({ checkoutUrl: data.checkoutUrl });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Top-up failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={className}>
      <p className="text-[13px] font-semibold text-neutral-900">Credit top-ups</p>
      <p className="mt-1 text-[12px] text-neutral-500">
        Extra credits for heavy months. Available only with an active plan or trial.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(TOPUPS) as TopupKey[]).map((key) => {
          const item = TOPUPS[key];
          return (
            <ThreeDButton
              key={key}
              type="button"
              variant="soft"
              size="sm"
              disabled={busy === key}
              onClick={() => void buy(key)}
            >
              {busy === key ? "Opening…" : `${item.name} · $${item.priceUsd}`}
            </ThreeDButton>
          );
        })}
      </div>
      {message && <p className="mt-2 text-[12px] text-red-600">{message}</p>}
    </div>
  );
}
