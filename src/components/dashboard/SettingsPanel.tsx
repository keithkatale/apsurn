"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { RebuildBlueprintButton } from "@/components/settings/RebuildBlueprintButton";
import { ConnectGoogleModal, GoogleLogo } from "@/components/settings/ConnectGoogleModal";
import { CreditTopupPanel } from "@/components/billing/CreditTopupPanel";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useSettingsPanel } from "./settings-panel-context";
import { createClient } from "@/lib/supabase/client";

type InboxRow = {
  id: string;
  provider: string;
  email_address: string;
  status: string;
  scopes?: string[] | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function SettingsPanel() {
  const { open, closeSettings, openSettings } = useSettingsPanel();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState<string | null>(null);
  const [company, setCompany] = useState<{
    websiteUrl: string | null;
    status: string | null;
    generatedAt: string | null;
    approvedAt: string | null;
  } | null>(null);
  const [inboxes, setInboxes] = useState<InboxRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [inboxBusy, setInboxBusy] = useState(false);

  useEffect(() => {
    if (searchParams.get("panel") === "settings" || searchParams.get("inbox") === "connected") {
      openSettings();
    }
  }, [searchParams, openSettings]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/settings/workspace", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setEmail(typeof data.email === "string" ? data.email : null);
        setCompany(data.company ?? null);
        setInboxes(Array.isArray(data.inboxes) ? data.inboxes : []);
        setLoadError(typeof data.error === "string" ? data.error : null);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load settings.");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const inboxError = searchParams.get("error");

  async function refreshInboxes() {
    const refresh = await fetch("/api/settings/workspace", { cache: "no-store" });
    const next = await refresh.json().catch(() => null);
    if (Array.isArray(next?.inboxes)) setInboxes(next.inboxes);
    router.refresh();
  }

  const connectedInbox = inboxes[0] ?? null;

  async function disconnectInbox() {
    if (!connectedInbox || inboxBusy) return;
    setInboxBusy(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/inboxes/smtp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inboxId: connectedInbox.id }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "Could not disconnect");
      setInboxes([]);
      router.refresh();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not disconnect");
    } finally {
      setInboxBusy(false);
    }
  }

  if (!open) return null;

  return (
    <>
    <div className="pointer-events-none absolute inset-0 z-40 flex justify-end">
      <aside className="pointer-events-auto flex h-full w-[420px] shrink-0 flex-col overflow-hidden border-l border-neutral-200 bg-white">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-neutral-900">Settings</h2>
            {email && <p className="text-xs text-neutral-500">{email}</p>}
          </div>
          <button
            type="button"
            onClick={closeSettings}
            aria-label="Close"
            className="shrink-0 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loadError && <p className="mb-3 text-sm text-red-600">{loadError}</p>}
          {inboxError && <p className="mb-3 text-sm text-red-600">{inboxError}</p>}

          <section className="mb-6">
            <h3 className="text-sm font-semibold text-neutral-900">Appearance</h3>
            <p className="mt-1 text-sm text-neutral-600">Light, dark, or match the system.</p>
            <div className="mt-3">
              <ThemeToggle />
            </div>
          </section>

          <section className="mb-6">
            <h3 className="text-sm font-semibold text-neutral-900">Account</h3>
            <p className="mt-1 truncate text-sm text-neutral-600">{email || "Signed in"}</p>
            <ThreeDButton
              type="button"
              variant="soft"
              size="sm"
              className="mt-3"
              onClick={async () => {
                try {
                  await createClient().auth.signOut();
                } catch (error) {
                  console.error("[auth] sign out failed:", error);
                }
                router.replace("/login");
              }}
            >
              Sign out
            </ThreeDButton>
          </section>

          <section className="mb-6 border-t border-neutral-100 pt-5">
            <h3 className="text-sm font-semibold text-neutral-900">Billing & credits</h3>
            <p className="mt-1 text-sm text-neutral-600">
              No free plan — AI and sending need an active subscription or $1 / 7-day trial. Top-ups are sold only in-app.
            </p>
            <CreditTopupPanel className="mt-3" />
          </section>

          <section className="mb-6 border-t border-neutral-100 pt-5">
            <h3 className="text-sm font-semibold text-neutral-900">Inbox</h3>
            <p className="mt-1 text-sm text-neutral-600">Campaigns send from your Google account.</p>
            {connectedInbox ? (
              <div className="mt-3 rounded-xl border border-neutral-200 px-3 py-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white">
                    <GoogleLogo className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-neutral-900">Google connected</p>
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        Active
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px] text-neutral-600">{connectedInbox.email_address}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ThreeDButton
                    type="button"
                    variant="soft"
                    size="sm"
                    disabled={inboxBusy}
                    onClick={() => setConnectOpen(true)}
                  >
                    Reconnect
                  </ThreeDButton>
                  <ThreeDButton
                    type="button"
                    variant="muted"
                    size="sm"
                    disabled={inboxBusy}
                    onClick={() => void disconnectInbox()}
                  >
                    {inboxBusy ? "Disconnecting…" : "Disconnect"}
                  </ThreeDButton>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <ThreeDButton type="button" variant="soft" size="sm" onClick={() => setConnectOpen(true)}>
                  <GoogleLogo className="size-3.5" />
                  Connect to Google
                </ThreeDButton>
              </div>
            )}
          </section>

          <section className="mb-6 border-t border-neutral-100 pt-5">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Company blueprint</h3>
                <p className="mt-1 text-sm text-neutral-600">ICP and positioning from your website.</p>
              </div>
              <RebuildBlueprintButton websiteUrl={company?.websiteUrl} />
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-neutral-500">Website</dt>
                <dd className="truncate text-neutral-900">{company?.websiteUrl ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Status</dt>
                <dd className="text-neutral-900">{company?.status ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Last built</dt>
                <dd className="text-neutral-900">{formatDate(company?.generatedAt)}</dd>
              </div>
              <div>
                <dt className="text-neutral-500">Approved</dt>
                <dd className={company?.approvedAt ? "text-neutral-900" : "text-amber-700"}>
                  {company?.approvedAt ? formatDate(company.approvedAt) : "Not approved"}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </aside>
    </div>
    <ConnectGoogleModal
      open={connectOpen}
      onClose={() => setConnectOpen(false)}
      defaultEmail={email ?? ""}
      onConnected={(connectedEmail) => {
        setInboxes((current) => [
          {
            id: current[0]?.id ?? "connected",
            provider: "gmail",
            email_address: connectedEmail,
            status: "connected",
          },
        ]);
        void refreshInboxes();
      }}
    />
    </>
  );
}
