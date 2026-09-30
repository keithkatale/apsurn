"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { DodoPayments } from "dodopayments-checkout";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { ACTIVATION_FEE_USD, PLANS, STARTER_CREDIT_USD, type PlanKey } from "@/lib/billing/plans";
import { trackGoal } from "@/lib/analytics/datafast";
import { ensureDodoCheckout } from "@/lib/billing/dodo-checkout-client";

export function TrialStartModal({
  open,
  onClose,
  defaultPlan = "startup",
}: {
  open: boolean;
  onClose: () => void;
  defaultPlan?: PlanKey;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = defaultPlan === "growth" ? "growth" : "startup";
  const selected = PLANS[plan];

  useEffect(() => {
    if (open) ensureDodoCheckout();
  }, [open]);

  if (!open) return null;

  async function startCredits() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json().catch(() => null)) as { checkoutUrl?: string; error?: string } | null;
      if (!res.ok || !data?.checkoutUrl) {
        throw new Error(data?.error || "Could not start checkout");
      }
      ensureDodoCheckout();
      trackGoal("initiate_checkout", { plan, starterCreditUsd: STARTER_CREDIT_USD });
      await DodoPayments.Checkout.open({ checkoutUrl: data.checkoutUrl });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 dark:bg-black/70"
      role="dialog"
      aria-modal
      aria-labelledby="unlock-credits-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-[24px] border border-[#E6E6E6] bg-white p-6 shadow-2xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          <X className="size-4" />
        </button>

        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#4379EE]">
          ${selected.priceUsd}/month
        </p>
        <h2 id="unlock-credits-title" className="mt-2 font-heading text-2xl font-semibold tracking-tight text-neutral-900">
          Get ${STARTER_CREDIT_USD} in free credits
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
          The {selected.name} plan is selected. Enter your card and ${STARTER_CREDIT_USD} in credits start right away.
          We charge ${ACTIVATION_FEE_USD} to activate them. The ${selected.priceUsd}/month plan is charged when those credits run out.
        </p>

        <ThreeDButton
          type="button"
          variant="solid"
          size="md"
          className="mt-6 h-11 w-full rounded-[12px] text-[15px] font-medium"
          disabled={busy}
          onClick={() => void startCredits()}
        >
          {busy ? "Opening…" : "Unlock"}
        </ThreeDButton>
        {error && <p className="mt-3 text-center text-[13px] text-red-600">{error}</p>}
      </div>
    </div>
  );
}

export async function openPlanCheckout(plan: PlanKey) {
  ensureDodoCheckout();
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  const data = (await res.json().catch(() => null)) as { checkoutUrl?: string; error?: string } | null;
  if (!res.ok || !data?.checkoutUrl) throw new Error(data?.error || "Checkout failed");
  trackGoal("initiate_checkout", { plan, starterCreditUsd: STARTER_CREDIT_USD });
  await DodoPayments.Checkout.open({ checkoutUrl: data.checkoutUrl });
}
