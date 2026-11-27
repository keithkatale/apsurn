"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { SpinLoader } from "@/components/loaders/spin-loader";
import { setNavigationPending } from "@/lib/navigation-progress";
import { trackGoal } from "@/lib/analytics/datafast";

/**
 * The link only opens this page; signing in takes one click. Mail scanners that pre-fetch links therefore
 * cannot use up the one-time token before the person gets to it.
 */
export function MagicConfirm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(token ? null : "This sign-in link is incomplete. Request a new one.");

  async function confirm() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/magic/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string; next?: string; isNew?: boolean } | null;
      if (!response.ok || !data?.next) throw new Error(data?.error || "Could not sign you in.");
      trackGoal(data.isNew ? "signup" : "login", { method: "magic_link" });
      setNavigationPending(true);
      window.location.assign(data.next);
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Could not sign you in.");
    }
  }

  return (
    <div>
      <BrandLogo href="/" size={28} className="mb-8" />
      <div className="mb-8">
        <h1 className="auth-title">Sign in to apsurn</h1>
        <p className="auth-subtitle">One click and you are in.</p>
      </div>
      {message ? <p className="auth-message mb-4">{message}</p> : null}
      {token ? (
        <button type="button" disabled={busy} onClick={() => void confirm()} className="auth-submit">
          {busy ? <SpinLoader size="sm" label="Loading" iconClassName="text-current" /> : "Continue"}
        </button>
      ) : null}
      {message ? (
        <p className="auth-subtitle mt-6">
          <Link href="/login">Back to sign in</Link>
        </p>
      ) : null}
    </div>
  );
}
