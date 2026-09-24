"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import { DodoPayments } from "dodopayments-checkout";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { PricingCardShell } from "@/components/ui/pricing-card-shell";
import { PLANS, TRIAL_DAYS, type PlanKey } from "@/lib/billing/plans";
import { trackGoal } from "@/lib/analytics/datafast";
import { ensureDodoCheckout } from "@/lib/billing/dodo-checkout-client";
import { cn } from "@/lib/cn";

/** Growth | Startup | Pro — Startup stays in the center. */
const MODAL_PLAN_ORDER: PlanKey[] = ["growth", "startup", "pro"];

export function TrialStartModal({
  open,
  onClose,
  defaultPlan = "startup",
}: {
  open: boolean;
  onClose: () => void;
  defaultPlan?: PlanKey;
}) {
  const [plan, setPlan] = useState<PlanKey>(defaultPlan);
  const [busy, setBusy] = useState<PlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) ensureDodoCheckout();
  }, [open]);

  useEffect(() => {
    setPlan(defaultPlan);
  }, [defaultPlan]);

  if (!open) return null;

  async function startTrial(nextPlan: PlanKey) {
    setPlan(nextPlan);
    setBusy(nextPlan);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: nextPlan, trial: true }),
      });
      const data = (await res.json().catch(() => null)) as { checkoutUrl?: string; error?: string } | null;
      if (!res.ok || !data?.checkoutUrl) {
        throw new Error(data?.error || "Could not start checkout");
      }
      ensureDodoCheckout();
      trackGoal("initiate_checkout", { plan: nextPlan, trial: true });
      await DodoPayments.Checkout.open({ checkoutUrl: data.checkoutUrl });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4 dark:bg-black/70"
      role="dialog"
      aria-modal
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative max-h-[92vh] w-full max-w-[1100px] overflow-y-auto rounded-[24px] border border-[#E6E6E6] bg-white p-5 shadow-2xl sm:p-7">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 sm:right-5 sm:top-5"
        >
          <X className="size-4" />
        </button>

        <div className="mx-auto max-w-2xl px-8 text-center sm:px-10">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-900 font-heading sm:text-2xl">
            Choose a plan to send
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-neutral-600 sm:text-[15px]">
            No free plan. Start a {TRIAL_DAYS}-day trial, cancel anytime, then continue on your monthly plan with AI
            credits.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-1 items-stretch gap-4 md:grid-cols-3 md:gap-3">
          {MODAL_PLAN_ORDER.map((key) => {
            const item = PLANS[key];
            const selected = plan === key;
            const highlight = key === "startup" || selected;
            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => setPlan(key)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setPlan(key);
                  }
                }}
                className={cn(
                  "cursor-pointer text-left outline-none",
                  key === "startup" && "md:-translate-y-1",
                  selected && key !== "startup" && "md:-translate-y-0.5",
                )}
              >
                <PricingCardShell
                  highlight={highlight}
                  className={cn(
                    "h-full transition-[box-shadow,transform]",
                    selected && "ring-2 ring-[#4379EE] ring-offset-2 ring-offset-white",
                  )}
                  footer={
                    <div className="flex flex-col gap-3">
                      <ThreeDButton
                        type="button"
                        variant={highlight ? "solid" : "soft"}
                        size="md"
                        className="h-11 w-full rounded-[12px] text-[15px] font-medium tracking-[-0.03em]"
                        disabled={busy === key}
                        onClick={(event) => {
                          event.stopPropagation();
                          void startTrial(key);
                        }}
                      >
                        {busy === key ? "Opening…" : `Start ${TRIAL_DAYS}-day trial`}
                      </ThreeDButton>
                      <div className="flex flex-col gap-2 px-1 pt-1">
                        {item.features.map((feature) => (
                          <div key={feature} className="flex items-start gap-2.5">
                            <div className="mt-0.5 size-[18px] shrink-0">
                              <Image
                                src="/landing/pricing-check.svg"
                                alt=""
                                width={18}
                                height={18}
                                className="size-[18px] object-contain"
                              />
                            </div>
                            <span className="text-[13px] leading-snug tracking-[-0.03em] text-neutral-600">
                              {feature}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  }
                >
                  <div className="flex flex-col gap-3">
                    <h3 className="text-[20px] font-semibold tracking-[-0.04em] text-neutral-900 font-heading leading-tight">
                      {item.name}
                    </h3>
                    <p className="text-[13px] leading-snug tracking-[-0.03em] text-neutral-600">{item.description}</p>
                  </div>
                  <div className="mt-auto flex items-baseline gap-1 pt-4">
                    <span className="text-[32px] font-semibold tracking-[-0.04em] text-neutral-900 leading-none">
                      ${item.priceUsd}
                    </span>
                    <span className="text-[13px] tracking-[-0.03em] text-neutral-500">/mo</span>
                  </div>
                </PricingCardShell>
              </div>
            );
          })}
        </div>

        {error && <p className="mt-4 text-center text-[13px] text-red-600">{error}</p>}
      </div>
    </div>
  );
}

export async function openPlanCheckout(plan: PlanKey, trial = true) {
  ensureDodoCheckout();
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, trial }),
  });
  const data = (await res.json().catch(() => null)) as { checkoutUrl?: string; error?: string } | null;
  if (!res.ok || !data?.checkoutUrl) throw new Error(data?.error || "Checkout failed");
  trackGoal("initiate_checkout", { plan, trial });
  await DodoPayments.Checkout.open({ checkoutUrl: data.checkoutUrl });
}
