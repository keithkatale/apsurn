"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { RebuildBlueprintButton } from "@/components/settings/RebuildBlueprintButton";
import { AiProviderSettings } from "@/components/settings/AiProviderSettings";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { useSettingsPanel } from "./settings-panel-context";
import { createClient } from "@/lib/supabase/client";

type InboxRow = {
  id: string;
  provider: string;
  email_address: string;
  status: string;
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
  const pathname = usePathname();
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

  useEffect(() => {
    if (searchParams.get("panel") === "settings" || searchParams.get("inbox") === "connected") {
      openSettings();
    }
  }, [searchParams, openSettings]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/settings/workspace")
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
  const connectNext = `${pathname}?panel=settings`;

  if (!open) return null;

  return (
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
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">Inbox</h3>
                <p className="mt-1 text-sm text-neutral-600">Campaigns send as you, from Gmail.</p>
              </div>
              <ThreeDButton href={`/api/inboxes/gmail/start?next=${encodeURIComponent(connectNext)}`} variant="solid" size="sm">
                Connect Gmail
              </ThreeDButton>
            </div>
            {inboxes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-sm text-neutral-500">
                No inbox connected yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {inboxes.map((inbox) => (
                  <li key={inbox.id} className="flex items-center justify-between rounded-xl border border-[#EEEEEE] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900">{inbox.email_address}</p>
                      <p className="text-[12px] text-neutral-500">{inbox.provider}</p>
                    </div>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">{inbox.status}</span>
                  </li>
                ))}
              </ul>
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

          <section className="border-t border-neutral-100 pt-5">
            <h3 className="mb-3 text-sm font-semibold text-neutral-900">AI provider</h3>
            <AiProviderSettings />
          </section>
        </div>
      </aside>
    </div>
  );
}
