"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { FloatingLabelFieldInput } from "@/components/inputs/floating-label-field-input";
import { SpinLoader } from "@/components/loaders/spin-loader";
import { createClient } from "@/lib/supabase/client";
import { setNavigationPending } from "@/lib/navigation-progress";

export function LoginForm({ mode = "signin" }: { mode?: "signin" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMessage(null);
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
      router.replace("/dashboard");
      return;
    }
    setBusy(false);
    setMessage("Check your email to confirm your account.");
  }

  return (
    <form
      className="mt-6 flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
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
        disabled={busy}
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
          <Link href="/signup" className="font-medium text-neutral-900 underline underline-offset-2">
            Create one
          </Link>
        </p>
      ) : (
        <p className="text-center text-sm text-neutral-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-neutral-900 underline underline-offset-2">
            Sign in
          </Link>
        </p>
      )}
    </form>
  );
}
