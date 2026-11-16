"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { BlueprintReviewForm, type BlueprintData } from "@/components/onboarding/BlueprintReviewForm";
import { RebuildBlueprintButton } from "@/components/settings/RebuildBlueprintButton";
import { CreditTopupPanel } from "@/components/billing/CreditTopupPanel";
import { createClient } from "@/lib/supabase/client";

const SECTIONS = [
  { id: "account", label: "Account" },
  { id: "company", label: "Company blueprint" },
  { id: "billing", label: "Billing & credits" },
] as const;

/** One group of related settings: a titled card whose rows are separated by hairlines. */
function SettingsSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-xl tracking-tight text-neutral-900" style={{ fontWeight: 700 }}>
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-neutral-500">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="divide-y divide-neutral-100 rounded-xl border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">{children}</div>
    </section>
  );
}

/** A single setting: what it is on the left, the control or value on the right. */
function SettingsRow({
  icon,
  title,
  description,
  children,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {icon}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-neutral-900">{title}</div>
          {description ? <p className="mt-0.5 truncate text-[13px] text-neutral-500">{description}</p> : null}
        </div>
      </div>
      <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 sm:justify-end">{children}</div>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function SettingsView() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [company, setCompany] = useState<{
    id?: string;
    blueprint?: BlueprintData | null;
    websiteUrl: string | null;
    status: string | null;
    generatedAt: string | null;
    approvedAt: string | null;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/workspace", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setEmail(typeof data.email === "string" ? data.email : null);
        setCompany(data.company ?? null);
        setLoadError(typeof data.error === "string" ? data.error : null);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load settings.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Highlight the section being read in the side list.
  useEffect(() => {
    const els = SECTIONS.map((section) => document.getElementById(section.id)).filter((el): el is HTMLElement => Boolean(el));
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const approved = Boolean(company?.approvedAt);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="pb-6">
        <h1 className="font-heading text-3xl tracking-tight text-neutral-900 sm:text-4xl" style={{ fontWeight: 700 }}>
          Settings
        </h1>
        {email && <p className="mt-1 text-sm text-neutral-500">{email}</p>}
      </header>

      {loadError && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>}

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-0 lg:h-fit lg:w-48 lg:shrink-0">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {SECTIONS.map((section) => (
              <li key={section.id} className="shrink-0">
                <a
                  href={`#${section.id}`}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    activeSection === section.id ? "bg-neutral-100 text-neutral-900" : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900"
                  }`}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 space-y-8 pb-16">
          <SettingsSection id="account" title="Account" description="The email you sign in with.">
            <SettingsRow title="Email" description="Used to sign in and for receipts.">
              <span className="truncate text-sm text-neutral-900">{email || "Signed in"}</span>
            </SettingsRow>
            <SettingsRow title="Sign out" description="End this session on this device.">
              <ThreeDButton
                type="button"
                variant="soft"
                size="sm"
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
            </SettingsRow>
          </SettingsSection>

          <SettingsSection
            id="company"
            title="Company blueprint"
            description="Your ICP and positioning, read from your website. Prospecting is built from it."
            action={<RebuildBlueprintButton websiteUrl={company?.websiteUrl} />}
          >
            <SettingsRow title="Website" description="The site the blueprint was built from.">
              <span className="truncate text-sm text-neutral-900">{company?.websiteUrl ?? "—"}</span>
            </SettingsRow>
            <SettingsRow title="Status" description="Whether the blueprint is ready to use.">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${company?.status === "ready" ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-600"}`}>
                {company?.status ?? "—"}
              </span>
            </SettingsRow>
            <SettingsRow title="Last built" description="When the website was last read.">
              <span className="text-sm text-neutral-900">{formatDate(company?.generatedAt)}</span>
            </SettingsRow>
            <SettingsRow title="Approved" description="You approve it once in setup.">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${approved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {approved ? formatDate(company?.approvedAt) : "Not approved"}
              </span>
            </SettingsRow>
            {company?.id && company.blueprint ? (
              <div className="px-5 py-4">
                <p className="mb-3 text-sm font-medium text-neutral-900">Edit your ICP</p>
                <BlueprintReviewForm
                  key={`${company.generatedAt}-${company.approvedAt}`}
                  companyId={company.id}
                  blueprint={company.blueprint}
                  mode="settings"
                  onSaved={() => router.refresh()}
                />
              </div>
            ) : null}
          </SettingsSection>

          <SettingsSection id="billing" title="Billing & credits" description="Plans start with 50 free credits. Your card is charged when they run out.">
            <SettingsRow title="Subscription" description="Change plan, update your card, or cancel.">
              <ThreeDButton
                type="button"
                variant="soft"
                size="sm"
                disabled={portalBusy}
                onClick={async () => {
                  setPortalBusy(true);
                  setLoadError(null);
                  try {
                    const res = await fetch("/api/billing/portal", { method: "POST" });
                    const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
                    if (!res.ok || !data?.url) throw new Error(data?.error || "Could not open subscription settings");
                    window.location.href = data.url;
                  } catch (error) {
                    setLoadError(error instanceof Error ? error.message : "Could not open subscription settings");
                    setPortalBusy(false);
                  }
                }}
              >
                {portalBusy ? "Opening…" : "Manage subscription"}
              </ThreeDButton>
            </SettingsRow>
            <div className="px-4 py-4 sm:px-5">
              <CreditTopupPanel />
            </div>
          </SettingsSection>
        </div>
      </div>
    </div>
  );
}
