"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Coins } from "lucide-react";
import { cn } from "@/lib/cn";

const CREDITS_EVENT = "apsurn:credits-changed";

/** Call after any client action that spends or grants credits. */
export function notifyCreditsChanged(balance?: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CREDITS_EVENT, { detail: { balance } }));
}

export function CreditsBalance({ className, variant = "pill" }: { className?: string; variant?: "pill" | "meter" }) {
  const [balance, setBalance] = useState<number | null>(null);
  const [granted, setGranted] = useState(0);
  const [spent, setSpent] = useState(0);
  const [active, setActive] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        creditBalance?: number;
        creditsGranted?: number;
        creditsSpent?: number;
        active?: boolean;
      };
      setBalance(typeof data.creditBalance === "number" ? data.creditBalance : 0);
      setGranted(typeof data.creditsGranted === "number" ? data.creditsGranted : 0);
      setSpent(typeof data.creditsSpent === "number" ? data.creditsSpent : 0);
      setActive(Boolean(data.active));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    const onCredits = (event: Event) => {
      const detail = (event as CustomEvent<{ balance?: number }>).detail;
      if (typeof detail?.balance === "number") {
        setBalance(detail.balance);
        return;
      }
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener(CREDITS_EVENT, onCredits);
    const interval = window.setInterval(() => void refresh(), 45_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(CREDITS_EVENT, onCredits);
      window.clearInterval(interval);
    };
  }, [refresh]);

  if (balance === null && variant === "meter") {
    return <span className={cn("block h-[74px] w-full animate-pulse rounded-lg bg-neutral-100", className)} aria-hidden />;
  }

  if (balance === null) {
    return (
      <span
        className={cn(
          "hidden h-8 min-w-[4.5rem] animate-pulse rounded-full bg-neutral-100 sm:inline-block",
          className,
        )}
        aria-hidden
      />
    );
  }

  const low = active && balance < 100;

  if (variant === "meter") {
    // "Bought" is everything ever granted; fall back to balance + spent for accounts that predate the counters.
    const total = Math.max(granted, balance + spent, 1);
    const used = Math.min(Math.max(spent, total - balance), total);
    const usedPct = Math.round((used / total) * 100);
    const remainingPct = 100 - usedPct;
    const critical = remainingPct <= 10;
    const warn = remainingPct <= 25;
    return (
      <Link
        href="/dashboard/settings"
        title={active ? "Credits left of everything you've bought — open Settings for top-ups" : "Start a plan to get credits"}
        className={cn(
          "block rounded-lg bg-neutral-100 px-3 py-2.5 transition-colors hover:bg-neutral-200/80",
          className,
        )}
      >
        <div className="flex items-center justify-between text-[12px]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-neutral-900">
            <Coins className="size-3.5 text-[#4379EE]" aria-hidden />
            Credits
          </span>
          <span className="tabular-nums text-neutral-500">{balance.toLocaleString()} left</span>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200"
          role="meter"
          aria-label="Credits remaining"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={balance}
        >
          <div
            className={cn("h-full rounded-full transition-[width]", critical ? "bg-red-500" : warn ? "bg-amber-500" : "bg-[#4379EE]")}
            style={{ width: `${remainingPct}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-neutral-500">
          <span>{used.toLocaleString()} used</span>
          <span>of {total.toLocaleString()}</span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href="/dashboard/settings"
      title={active ? "Credits remaining — open Settings for top-ups" : "Start a plan to get credits"}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold tabular-nums transition-colors",
        low
          ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
          : "border-neutral-200 bg-neutral-50 text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900",
        className,
      )}
    >
      <Coins className="size-3.5 shrink-0 text-[#4379EE]" aria-hidden />
      <span>{balance.toLocaleString()}</span>
      <span className="font-medium text-neutral-500">credits</span>
    </Link>
  );
}
