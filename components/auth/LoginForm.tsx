"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { SpinLoader } from "@/components/loaders/spin-loader";

function safeNext(raw: string | null, fallback: string) {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export function LoginForm({ mode = "signin" }: { mode?: "signin" | "signup" }) {
  const searchParams = useSearchParams();
  const next = useMemo(() => safeNext(searchParams.get("next"), "/auth/continue"), [searchParams]);
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [message, setMessage] = useState<string | null>(() => {
    if (searchParams.get("error") === "auth") return "Google sign-in failed. Try again.";
    if (searchParams.get("error") === "verify") return searchParams.get("message") || "That sign-in link did not work.";
    return null;
  });
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const isSignup = mode === "signup";
  const fromSetup = searchParams.get("from") === "setup";

  async function sendLink() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/magic/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), next }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Could not send the link. Please try again.");
      setSentTo(email.trim());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send the link. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function continueWithGoogle() {
    setGoogleBusy(true);
    setMessage(null);
    window.location.assign(`/api/auth/google/start?next=${encodeURIComponent(next)}`);
  }

  const explicitNext = searchParams.get("next");
  const switchHref = `${isSignup ? "/login" : "/signup"}${explicitNext ? `?next=${encodeURIComponent(next)}` : ""}`;

  if (sentTo) {
    return (
      <div>
        <BrandLogo href="/" size={28} className="mb-8" />
        <div className="mb-8">
          <h1 className="auth-title">Check your email</h1>
          <p className="auth-subtitle">
            We sent a sign-in link to <strong>{sentTo}</strong>. It works once and expires in 15 minutes.
          </p>
        </div>
        {message ? <p className="auth-message mb-4">{message}</p> : null}
        <button type="button" disabled={busy} onClick={() => void sendLink()} className="auth-google">
          {busy ? <SpinLoader size="sm" label="Loading" iconClassName="text-current" /> : "Send it again"}
        </button>
        <p className="auth-subtitle mt-6">
          Wrong address?{" "}
          <button type="button" className="underline" onClick={() => setSentTo(null)}>
            Use a different email
          </button>
        </p>
      </div>
    );
  }

  return (
    <div>
      <BrandLogo href="/" size={28} className="mb-8" />
      <div className="mb-8">
        <h1 className="auth-title">{isSignup ? (fromSetup ? "One last step" : "Create your account") : "Welcome back"}</h1>
        <p className="auth-subtitle">
          {isSignup && fromSetup ? "Create your account to open your campaigns. " : null}
          {isSignup ? "Already have an account? " : "Don't have an account? "}
          <Link href={switchHref}>{isSignup ? "Sign in" : "Sign up"}</Link>
        </p>
      </div>

      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void sendLink();
        }}
      >
        <label className="block">
          <span className="auth-label">Email address</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="Email address"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="auth-input"
          />
        </label>

        {message ? <p className="auth-message">{message}</p> : null}

        <button type="submit" disabled={busy || googleBusy} className="auth-submit">
          {busy ? <SpinLoader size="sm" label="Loading" iconClassName="text-current" /> : "Email me a sign-in link"}
        </button>
        <p className="auth-subtitle">No password needed. We email you a link that signs you in.</p>

        <div className="auth-divider" aria-hidden>
          <span>or</span>
        </div>

        <button type="button" disabled={busy || googleBusy} onClick={continueWithGoogle} className="auth-google">
          {googleBusy ? (
            <SpinLoader size="sm" label="Loading" iconClassName="text-current" />
          ) : (
            <>
              <GoogleMark className="size-5" />
              Continue with Google
            </>
          )}
        </button>
      </form>
    </div>
  );
}
