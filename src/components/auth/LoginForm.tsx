"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { FloatingLabelFieldInput } from "@/components/inputs/floating-label-field-input";
import { SpinLoader } from "@/components/loaders/spin-loader";
import { createClient } from "@/lib/supabase/client";
import { setNavigationPending } from "@/lib/navigation-progress";

function safeNext(raw: string | null, fallback: string) {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z"
      />
      <path
        fill="#34A853"
        d="M6.6 14.3 5.7 15l-2.5 2c1.6 3.1 4.9 5.2 8.8 5.2 2.7 0 4.9-.9 6.5-2.4l-3.1-2.4c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1z"
      />
      <path
        fill="#4A90E2"
        d="M3.2 7c-.6 1.2-.9 2.5-.9 4s.3 2.8.9 4c0 .1 2.5-1.9 2.5-1.9-.2-.5-.3-1-.3-1.6s.1-1.1.3-1.6L3.2 7z"
      />
      <path
        fill="#FBBC05"
        d="M12 5.4c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 2.4 14.7 1.5 12 1.5 8.1 1.5 4.8 3.6 3.2 6.7L6.6 9c.8-2.3 3-3.6 5.4-3.6z"
      />
    </svg>
  );
}

export function LoginForm({ mode = "signin" }: { mode?: "signin" | "signup" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = useMemo(
    () => safeNext(searchParams.get("next"), mode === "signup" ? "/setup" : "/dashboard"),
    [searchParams, mode],
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(
    searchParams.get("error") === "auth" ? "Google sign-in failed. Try again." : null,
  );
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const result =
        mode === "signin"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (result.error) {
        setBusy(false);
        setMessage(result.error.message);
        return;
      }
      if (result.data.session) {
        setNavigationPending(true);
        router.replace(next);
        return;
      }
      setBusy(false);
      setMessage("Check your email to confirm your account.");
    } catch (error) {
      setBusy(false);
      setMessage(error instanceof Error ? error.message : "Could not sign in. Please try again.");
    }
  }

  async function continueWithGoogle() {
    setGoogleBusy(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, queryParams: { access_type: "offline", prompt: "select_account" } },
      });
      if (error) {
        setGoogleBusy(false);
        setMessage(error.message);
      }
    } catch (error) {
      setGoogleBusy(false);
      setMessage(error instanceof Error ? error.message : "Could not start Google sign-in.");
    }
  }

  return (
    <form
      className="mt-6 flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <ThreeDButton
        type="button"
        variant="soft"
        disabled={busy || googleBusy}
        onClick={() => void continueWithGoogle()}
        className="h-11 w-full rounded-[12px] text-[15px] font-medium tracking-[-0.03em]"
      >
        {googleBusy ? (
          <SpinLoader size="sm" label="Loading" />
        ) : (
          <span className="inline-flex items-center gap-2.5">
            <GoogleMark className="size-4" />
            Continue with Google
          </span>
        )}
      </ThreeDButton>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-neutral-200" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">or</span>
        <div className="h-px flex-1 bg-neutral-200" />
      </div>

      <FloatingLabelFieldInput
        label="Work email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        containerClassName="max-w-none"
      />
      <FloatingLabelFieldInput
        label="Password"
        type="password"
        required
        minLength={8}
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        containerClassName="max-w-none"
      />
      {message && <p className="text-sm text-neutral-600">{message}</p>}
      <ThreeDButton
        type="submit"
        variant="solid"
        disabled={busy || googleBusy}
        className="h-11 w-full rounded-[12px] text-[16px] font-medium tracking-[-0.03em]"
      >
        {busy ? (
          <SpinLoader size="sm" label="Loading" iconClassName="text-white" />
        ) : (
          <span>{mode === "signin" ? "Sign in" : "Create account"}</span>
        )}
      </ThreeDButton>
      {mode === "signin" ? (
        <p className="text-center text-sm text-neutral-600">
          No account?{" "}
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className="font-medium text-neutral-900 underline underline-offset-2"
          >
            Create one
          </Link>
        </p>
      ) : (
        <p className="text-center text-sm text-neutral-600">
          Already have an account?{" "}
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="font-medium text-neutral-900 underline underline-offset-2"
          >
            Sign in
          </Link>
        </p>
      )}
    </form>
  );
}
