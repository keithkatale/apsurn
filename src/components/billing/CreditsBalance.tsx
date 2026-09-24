"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { cn } from "@/lib/cn";
import { useSettingsPanel } from "@/components/dashboard/settings-panel-context";

const CREDITS_EVENT = "apsurn:credits-changed";

/** Call after any client action that spends or grants credits. */
export function notifyCreditsChanged(balance?: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CREDITS_EVENT, { detail: { balance } }));
}

export function CreditsBalance({ className }: { className?: string }) {
  const { openSettings } = useSettingsPanel();
  const [balance, setBalance] = useState<number | null>(null);
  const [active, setActive] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { creditBalance?: number; active?: boolean };
      setBalance(typeof data.creditBalance === "number" ? data.creditBalance : 0);
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

  return (
    <button
      type="button"
      onClick={openSettings}
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
    </button>
  );
}
