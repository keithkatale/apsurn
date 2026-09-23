"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { cn } from "@/lib/cn";

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.82-.07-1.64-.23-2.43H12v4.6h6.46a5.52 5.52 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.55-5.17 3.55-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.97-1.07 7.96-2.93l-3.88-3c-1.08.73-2.47 1.16-4.08 1.16-3.14 0-5.8-2.12-6.75-4.97H1.25v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.25 14.26A7.2 7.2 0 0 1 4.87 12c0-.79.13-1.55.36-2.26V6.64H1.25A12 12 0 0 0 0 12c0 1.94.46 3.77 1.25 5.36l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.96 1.14 15.24 0 12 0 7.31 0 3.23 2.69 1.25 6.64l4 3.1C6.2 6.87 8.86 4.75 12 4.75Z"
      />
    </svg>
  );
}

const STEPS = [
  {
    title: "Use the Gmail you send from",
    body: "Outreach goes out as you, from this address. Workspace addresses work if they sit on Google.",
  },
  {
    title: "Create a sending key",
    body: "Google will show a 16-character key once. Name it Apsurn, copy it, then come back here.",
  },
  {
    title: "Paste the key Google generated",
    body: "This is not your Gmail password. It’s the 16-character key from the previous screen.",
  },
] as const;

export function ConnectGoogleModal({
  open,
  onClose,
  defaultEmail,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  defaultEmail: string;
  onConnected: (email: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState(defaultEmail);
  const [appPassword, setAppPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setEmail(defaultEmail);
    setAppPassword("");
    setBusy(false);
    setError(null);
  }, [open, defaultEmail]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const last = step === STEPS.length - 1;
  const current = STEPS[step];

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/inboxes/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, appPassword }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; email?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Could not connect Google");
      onConnected(data?.email ?? email);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Google");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setError(null);
    if (step === 0 && !email.trim()) {
      setError("Enter the Gmail address campaigns should send from.");
      return;
    }
    if (last) {
      void connect();
      return;
    }
    setStep((value) => value + 1);
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-labelledby="connect-google-title"
        className="w-full max-w-[440px] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-[0_24px_64px_rgba(0,0,0,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-full border border-neutral-200 bg-white">
              <GoogleMark className="size-5" />
            </span>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Inbox</p>
              <h2 id="connect-google-title" className="text-[15px] font-semibold text-neutral-900">
                Connect to Google
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <div className="flex gap-1.5">
            {STEPS.map((item, index) => (
              <span
                key={item.title}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  index <= step ? "bg-[#4379EE]" : "bg-neutral-200",
                )}
              />
            ))}
          </div>
          <p className="mt-3 text-[12px] font-medium text-neutral-500">
            Step {step + 1} of {STEPS.length}
          </p>
          <h3 className="mt-1 text-[17px] font-semibold tracking-tight text-neutral-900">{current.title}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600">{current.body}</p>
        </div>

        <div className="px-5 py-4">
          {step === 0 && (
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-neutral-600">Gmail address</span>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@gmail.com"
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[13px] text-neutral-900 outline-none focus:border-[#4379EE]"
              />
            </label>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4379EE] px-3.5 py-2.5 text-[13px] font-semibold text-white shadow-[0_1px_1px_rgba(20,50,150,0.35),0_3px_6px_rgba(20,50,150,0.28),inset_0_1px_2px_rgba(255,255,255,0.28)] hover:bg-[#3567D6]"
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-white">
                  <GoogleMark className="size-3.5" />
                </span>
                Create a sending key in Google
                <ArrowRight className="size-3.5" />
              </a>
              <p className="text-[12px] leading-relaxed text-neutral-500">
                Google may refuse this if 2-Step Verification is off.{" "}
                <a
                  href="https://myaccount.google.com/signinoptions/two-step-verification"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-[#4379EE] underline"
                >
                  Turn it on
                </a>
                , then try again.
              </p>
            </div>
          )}

          {step === 2 && (
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-neutral-600">Sending key</span>
              <input
                type="password"
                autoFocus
                autoComplete="off"
                value={appPassword}
                onChange={(event) => setAppPassword(event.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[13px] tracking-wide text-neutral-900 outline-none focus:border-[#4379EE]"
              />
            </label>
          )}

          {error && <p className="mt-3 text-[12px] text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-neutral-100 px-5 py-4">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => {
              setError(null);
              setStep((value) => Math.max(0, value - 1));
            }}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-neutral-500 disabled:opacity-30 hover:text-neutral-800"
          >
            <ArrowLeft className="size-3.5" />
            Back
          </button>
          <ThreeDButton type="button" variant="solid" size="sm" disabled={busy} onClick={next}>
            {busy ? "Connecting…" : last ? "Connect" : "Continue"}
          </ThreeDButton>
        </div>
      </div>
    </div>
  );
}

export function GoogleLogo({ className }: { className?: string }) {
  return <GoogleMark className={className} />;
}
