"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Globe } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { CampaignCard, CampaignCardSkeleton } from "@/components/campaigns/CampaignCard";
import { CompanyFavicon } from "@/components/prospects/CompanyFavicon";
import { ContactsTable } from "@/components/prospects/ContactsTable";
import type { ContactRow, LeadStatus, ProspectRow } from "@/components/prospects/types";
import { ScanOverlay, type ScanLogEntry, type ScanState } from "@/components/progress/ScanOverlay";
import { PricingCardShell } from "@/components/ui/pricing-card-shell";
import { type CampaignDefinition } from "@/lib/onboarding/campaign-templates";
import { trackGoal } from "@/lib/analytics/datafast";
import { cn } from "@/lib/cn";
import { SetupStepper } from "./SetupStepper";
import type { BlueprintData } from "./BlueprintReviewForm";

function stripProtocol(raw: string) {
  return raw.trim().replace(/^https?:\/\//i, "").replace(/^\/+/, "");
}

function isValidDomain(raw: string) {
  const value = stripProtocol(raw);
  if (!value || /\s/.test(value)) return false;
  const host = value.split("/")[0].split("?")[0].split("#")[0].split(":")[0].toLowerCase();
  if (host === "localhost") return true;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(host);
}

function competitorDomain(name: string) {
  const trimmed = name.trim();
  if (/[.]/.test(trimmed) && !/\s/.test(trimmed)) return stripProtocol(trimmed);
  return `${trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com`;
}

function listToText(items: string[]): string {
  return items.join(", ");
}

function textToList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

let logId = 0;
function uid() {
  logId += 1;
  return `setup-${Date.now()}-${logId}`;
}

function scanningState(logs: string[], progress: number): ScanState {
  return {
    phase: "scanning",
    progress,
    logs: logs.map((text) => ({ id: uid(), text }) as ScanLogEntry),
  };
}

function emptyContact(id: string, title?: string | null): ContactRow {
  return {
    id,
    full_name: null,
    title: title ?? null,
    email: null,
    email_status: "unverified",
    phone: null,
    linkedin_url: null,
    contact_origin: "setup",
    confidence: null,
    evidence: [],
    lead_status: "new" as LeadStatus,
    archived_at: null,
    qualify_reason: null,
  };
}

function mapProspects(raw: unknown): ProspectRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 10).flatMap((row): ProspectRow[] => {
    if (!row || typeof row !== "object") return [];
    const company = row as Record<string, unknown>;
    if (typeof company.id !== "string") return [];
    const contacts = Array.isArray(company.contacts) ? company.contacts : [];
    const mapped: ContactRow[] = contacts.flatMap((contact): ContactRow[] => {
      if (!contact || typeof contact !== "object") return [];
      const c = contact as Record<string, unknown>;
      if (typeof c.id !== "string") return [];
      return [
        {
          ...emptyContact(c.id, typeof c.title === "string" ? c.title : null),
          full_name: typeof c.full_name === "string" ? c.full_name : null,
          email: typeof c.email === "string" ? c.email : null,
          email_status: typeof c.email_status === "string" ? c.email_status : "unverified",
          phone: typeof c.phone === "string" ? c.phone : null,
          lead_status: (typeof c.lead_status === "string" ? c.lead_status : "new") as LeadStatus,
          qualify_reason: typeof c.qualify_reason === "string" ? c.qualify_reason : null,
        },
      ];
    });
    return [
      {
        id: company.id,
        name: typeof company.name === "string" ? company.name : "Unknown",
        domain: typeof company.domain === "string" ? company.domain : "",
        industry: typeof company.industry === "string" ? company.industry : null,
        location: typeof company.location === "string" ? company.location : null,
        icp_fit_score: typeof company.icp_fit_score === "number" ? company.icp_fit_score : null,
        data_confidence: typeof company.data_confidence === "number" ? company.data_confidence : null,
        status: typeof company.status === "string" ? company.status : "new",
        qualify_reason: typeof company.qualify_reason === "string" ? company.qualify_reason : null,
        evidence: [],
        recommended_contact_id: null,
        archived_at: null,
        contacts: mapped.length > 0 ? mapped : [emptyContact(`${company.id}-pending`, "Finding decision maker…")],
      },
    ];
  });
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-0.5 text-xs", className)}>
      <span className="font-medium text-neutral-600">{label}</span>
      {children}
    </label>
  );
}

function SetupScanFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center p-4">
      <div className="w-[22rem] shrink-0">{children}</div>
    </div>
  );
}

function SetupWizardInner({ initialUrl = "" }: { initialUrl?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [started, setStarted] = useState(false);
  const [domain, setDomain] = useState(() =>
    stripProtocol(initialUrl || searchParams.get("url") || searchParams.get("websiteUrl") || ""),
  );
  const [domainError, setDomainError] = useState(false);
  const [scan, setScan] = useState<ScanState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<BlueprintData | null>(null);
  const [industries, setIndustries] = useState("");
  const [companySizeRange, setCompanySizeRange] = useState("");
  const [geographies, setGeographies] = useState("");
  const [valueProp, setValueProp] = useState("");
  const [positioning, setPositioning] = useState("");
  const [productSummary, setProductSummary] = useState("");
  const [competitorsText, setCompetitorsText] = useState("");
  const [campaigns, setCampaigns] = useState<CampaignDefinition[]>([]);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const confirmLock = useRef(false);

  const valid = useMemo(() => isValidDomain(domain), [domain]);

  function applyBlueprint(raw: BlueprintData) {
    const next: BlueprintData = {
      ...raw,
      competitors: Array.isArray(raw.competitors) ? raw.competitors : [],
      personas: Array.isArray(raw.personas) ? raw.personas : [],
    };
    setBlueprint(next);
    setIndustries(listToText(next.icp.industries ?? []));
    setCompanySizeRange(next.icp.companySizeRange ?? "");
    setGeographies(listToText(next.icp.geographies ?? []));
    setValueProp(next.value_prop ?? "");
    setPositioning(next.positioning ?? "");
    setProductSummary(next.product_summary ?? "");
    setCompetitorsText(listToText(next.competitors));
  }

  function currentBlueprintPatch() {
    if (!blueprint) return null;
    return {
      icp: {
        industries: textToList(industries),
        companySizeRange,
        geographies: textToList(geographies),
        budgetSignals: blueprint.icp.budgetSignals,
      },
      personas: blueprint.personas,
      value_prop: valueProp,
      positioning,
      product_summary: productSummary,
      competitors: [],
    };
  }

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setDomainError(true);
      return;
    }
    setStarted(true);
    setStep(1);
    setError(null);
    setScan(scanningState(["Reading your website…"], 12));
    const ticks = [
      { at: 400, text: "Extracting product and positioning", progress: 32 },
      { at: 1400, text: "Building the ICP", progress: 62 },
    ];
    const timers = ticks.map((tick) =>
      window.setTimeout(() => {
        setScan((prev) =>
          prev?.phase === "scanning"
            ? { ...prev, progress: tick.progress, logs: [...prev.logs, { id: uid(), text: tick.text }].slice(-12) }
            : prev,
        );
      }, tick.at),
    );
    try {
      const res = await fetch("/api/onboarding/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: `https://${stripProtocol(domain)}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not analyze the website");
      setCompanyId(data.company.id);
      applyBlueprint(data.blueprint as BlueprintData);
      setScan(null);
    } catch (err) {
      setScan({
        phase: "error",
        progress: 100,
        logs: [{ id: uid(), text: "Could not finish the website read" }],
        error: err instanceof Error ? err.message : "Could not analyze the website",
      });
    } finally {
      timers.forEach((id) => window.clearTimeout(id));
    }
  }

  async function approveAndContinue() {
    if (!companyId || !blueprint || confirmLock.current) return;
    confirmLock.current = true;
    const patch = currentBlueprintPatch();
    setStep(2);
    setScan(scanningState(["Searching companies in the same category…"], 20));
    try {
      const res = await fetch("/api/onboarding/blueprint", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...patch, approve: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not save blueprint");
      trackGoal("blueprint_approved");
      setScan((prev) =>
        prev?.phase === "scanning"
          ? { ...prev, progress: 55, logs: [...prev.logs, { id: uid(), text: "Matching similar services…" }] }
          : prev,
      );
      const found = await fetch("/api/onboarding/competitors", { method: "POST" });
      const data = await found.json().catch(() => ({ competitors: [] }));
      if (!found.ok) throw new Error(data.error ?? "Could not find competitors");
      const names = Array.isArray(data.competitors) ? data.competitors.filter((x: unknown): x is string => typeof x === "string") : [];
      setCompetitorsText(listToText(names));
      setScan(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save blueprint");
      setScan(null);
    } finally {
      confirmLock.current = false;
    }
  }

  async function loadCampaigns() {
    if (!blueprint) return;
    setStep(3);
    setCampaigns([]);
    setCampaignLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/campaigns", { method: "POST" });
      if (!res.ok || !res.body) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(typeof payload.error === "string" ? payload.error : "Could not define campaigns");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            const event = JSON.parse(line.slice(5).trim()) as {
              type?: string;
              campaign?: CampaignDefinition;
              error?: string;
            };
            if (event.type === "campaign" && event.campaign?.segmentKey) {
              setCampaigns((prev) => {
                if (prev.some((c) => c.segmentKey === event.campaign!.segmentKey)) return prev;
                return [...prev, event.campaign!];
              });
            }
            if (event.type === "error") throw new Error(event.error ?? "Could not define campaigns");
          } catch (err) {
            if (err instanceof SyntaxError) continue;
            throw err;
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not define campaigns");
    } finally {
      setCampaignLoading(false);
    }
  }

  async function findAccounts() {
    if (!blueprint) return;
    setStep(4);
    setScan(scanningState(["Finding companies that match your ICP…"], 10));
    try {
      const personas = (blueprint.personas ?? []).map((p) => p.title).filter(Boolean);
      const res = await fetch("/api/prospecting/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: 1,
          listName: "Setup — first 6 accounts",
          limit: 6,
          criteria: {
            industries: textToList(industries),
            companySizeRange,
            geographies: textToList(geographies),
            personas,
            minimumConfidence: 0.5,
            requiredContactChannels: ["email"],
          },
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(typeof payload.error === "string" ? payload.error : "Prospecting failed");
      }
      if (!res.body) throw new Error("Prospecting failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastPoll = 0;
      const refresh = async () => {
        const listRes = await fetch("/api/prospect-companies");
        const listData = await listRes.json().catch(() => ({ companies: [] }));
        setProspects(mapProspects(listData.companies));
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            const event = JSON.parse(line.slice(5).trim()) as {
              type?: string;
              name?: string;
              found?: number;
              contactCount?: number;
            };
            if (event.type === "tool_start" && event.name === "find_companies") {
              setScan((prev) =>
                prev
                  ? { ...prev, progress: Math.min(90, prev.progress + 8), logs: [...prev.logs, { id: uid(), text: "Listing companies from your ICP…" }].slice(-12) }
                  : prev,
              );
            }
            if (event.type === "tool_start" && event.name === "find_people") {
              setScan((prev) =>
                prev
                  ? { ...prev, progress: Math.min(94, prev.progress + 4), logs: [...prev.logs, { id: uid(), text: "Finding decision makers…" }].slice(-12) }
                  : prev,
              );
            }
            if (event.type === "tool_start" && event.name === "save_lead") {
              setScan((prev) =>
                prev
                  ? { ...prev, progress: Math.min(96, prev.progress + 2), logs: [...prev.logs, { id: uid(), text: "Saving new accounts…" }].slice(-12) }
                  : prev,
              );
            }
            if (event.type === "done") {
              setScan({
                phase: "done",
                progress: 100,
                logs: [{ id: uid(), text: `Saved ${event.found ?? 0} companies · ${event.contactCount ?? 0} people` }],
              });
            }
          } catch {
            /* ignore */
          }
        }
        const now = Date.now();
        if (now - lastPoll > 2500) {
          lastPoll = now;
          await refresh();
        }
      }
      await refresh();
      setScan(null);
    } catch (err) {
      setScan({
        phase: "error",
        progress: 100,
        logs: [],
        error: err instanceof Error ? err.message : "Could not find accounts",
      });
    }
  }

  async function finishSetup() {
    setStep(5);
    setScan(scanningState(["Opening your campaigns…"], 70));
    try {
      await fetch("/api/onboarding/campaigns/enroll", { method: "POST" });
      router.push("/dashboard/campaigns");
    } catch (err) {
      setScan({
        phase: "error",
        progress: 100,
        logs: [],
        error: err instanceof Error ? err.message : "Could not open campaigns",
      });
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.metaKey || event.ctrlKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "TEXTAREA") return;
      if (step === 1 && blueprint && !scan) {
        event.preventDefault();
        void approveAndContinue();
      }
      if (step === 3 && campaigns.length > 0 && !campaignLoading) {
        event.preventDefault();
        void findAccounts();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, blueprint, scan, campaigns.length, campaignLoading]);

  const competitorNames = textToList(competitorsText);
  const showScan = Boolean(scan && (scan.phase === "scanning" || scan.phase === "error"));
  const scanCentered =
    (showScan && step !== 4) || (step === 3 && campaignLoading && campaigns.length === 0);
  const accountRows =
    prospects.length > 0
      ? prospects
      : showScan
        ? Array.from({ length: 10 }, (_, index) => ({
            id: `setup-placeholder-${index}`,
            name: "Searching…",
            domain: "",
            industry: null,
            location: null,
            icp_fit_score: null,
            data_confidence: null,
            status: "new",
            qualify_reason: null,
            evidence: [],
            recommended_contact_id: null,
            archived_at: null,
            contacts: [emptyContact(`setup-placeholder-${index}-c`, "Finding decision maker…")],
          }))
        : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {started && (
        <div className="shrink-0 pb-3">
          <SetupStepper current={step} />
        </div>
      )}
      {error && !showScan && (
        <div className="mb-3 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div
        className={cn(
          "min-h-0 flex-1",
          step === 1 && !started && "flex items-center justify-center pb-[8vh]",
          scanCentered || step === 4 ? "flex flex-col overflow-hidden" : step === 1 && !started ? "" : "overflow-y-auto overscroll-contain",
        )}
      >
      {step === 1 && !started && (
        <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-5 text-center">
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900">Enter your business domain.</h1>
            <p className="mt-1 text-sm text-neutral-600">Enter your domain. We&apos;ll read the site and draft the ICP.</p>
          </div>
          <form onSubmit={analyze} className="w-full max-w-md">
            <div className="flex h-11 items-center gap-2 rounded-xl border border-neutral-300 bg-white pl-3 pr-1">
              <Globe className="size-4 shrink-0 text-neutral-400" />
              <span className="shrink-0 text-sm text-neutral-500">https://</span>
              <input
                className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none"
                placeholder="yourcompany.com"
                value={domain}
                onChange={(e) => {
                  setDomainError(false);
                  setDomain(stripProtocol(e.target.value));
                }}
              />
              <ThreeDButton type="submit" variant="solid" size="sm" className="shrink-0">
                <span>Analyze</span>
                <ArrowRight className="size-3.5" />
              </ThreeDButton>
            </div>
            {domainError && <p className="mt-2 text-left text-sm text-red-600">Enter a valid domain like acme.com</p>}
          </form>
        </div>
      )}

      {step === 1 && started && showScan && (
        <SetupScanFrame>
          <ScanOverlay
            compact
            state={scan!}
            kicker="Step 1"
            title="Researching your company"
            runningLabel="Reading"
            onRetry={() => {
              setScan(null);
              setStarted(false);
              setStep(1);
            }}
          />
        </SetupScanFrame>
      )}

      {step === 1 && started && blueprint && !showScan && (
        <div className="setup-rise mx-auto w-full max-w-xl px-1">
          <PricingCardShell
            highlight
            className="p-2.5"
            innerClassName="gap-2 p-3 sm:p-3.5"
            footer={
              <div className="flex items-center justify-between gap-3 px-0.5">
                <p className="text-xs text-[#605f5f]">Press Enter when it looks right.</p>
                <ThreeDButton type="button" variant="solid" size="sm" onClick={() => void approveAndContinue()}>
                  Continue
                </ThreeDButton>
              </div>
            }
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4379EE]">Company blueprint</p>
            {blueprint.confidence === "heuristic_fallback" && (
              <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                Built with a fallback model. Edit anything that looks off.
              </p>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label="Target industries" className="sm:col-span-2">
                <input className="input py-1.5 text-xs" value={industries} onChange={(e) => setIndustries(e.target.value)} />
              </Field>
              <Field label="Company size">
                <input className="input py-1.5 text-xs" value={companySizeRange} onChange={(e) => setCompanySizeRange(e.target.value)} />
              </Field>
              <Field label="Geographies">
                <input className="input py-1.5 text-xs" value={geographies} onChange={(e) => setGeographies(e.target.value)} />
              </Field>
            </div>
            <Field label="Value proposition">
              <textarea className="input min-h-11 py-1.5 text-xs" value={valueProp} onChange={(e) => setValueProp(e.target.value)} />
            </Field>
            <Field label="Positioning">
              <textarea className="input min-h-11 py-1.5 text-xs" value={positioning} onChange={(e) => setPositioning(e.target.value)} />
            </Field>
            <Field label="Product summary">
              <textarea className="input min-h-11 py-1.5 text-xs" value={productSummary} onChange={(e) => setProductSummary(e.target.value)} />
            </Field>
            {blueprint.personas.length > 0 && (
              <p className="text-xs text-neutral-600">
                <span className="font-medium text-neutral-700">Personas: </span>
                {blueprint.personas.map((p) => p.title).join(" · ")}
              </p>
            )}
          </PricingCardShell>
        </div>
      )}

      {step === 2 && showScan && (
        <SetupScanFrame>
          <ScanOverlay compact state={scan!} kicker="Step 2" title="Exploring competitors" runningLabel="Listing" />
        </SetupScanFrame>
      )}

      {step === 2 && !showScan && (
        <div className="setup-rise mx-auto w-full max-w-[920px]">
          <PricingCardShell className="p-3" innerClassName="p-3 sm:p-4">
            <div className="grid gap-4 md:grid-cols-2 md:gap-0">
              <div className="flex flex-col gap-2 md:pr-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4379EE]">Product</p>
                <h3 className="font-heading text-[17px] font-semibold leading-snug tracking-[-0.04em] text-black">
                  {productSummary || "Your product"}
                </h3>
                {positioning && <p className="text-[13px] leading-snug text-[#605f5f]">{positioning}</p>}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {textToList(industries).slice(0, 3).map((industry) => (
                    <span key={industry} className="rounded-md bg-neutral-50 px-2 py-1 text-[12px] text-neutral-700">
                      {industry}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4379EE]">Competitors</p>
                  <span className="text-[11px] text-emerald-600">{competitorNames.length} found</span>
                </div>
                <ul className="flex max-h-[280px] flex-col gap-1 overflow-y-auto">
                  {competitorNames.length === 0 && (
                    <li className="text-[13px] text-neutral-500">None found yet — you can still continue.</li>
                  )}
                  {competitorNames.map((name) => (
                    <li key={name} className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2 py-1.5 text-[13px]">
                      <CompanyFavicon domain={competitorDomain(name)} name={name} className="size-4" />
                      <span className="truncate text-neutral-800">{name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </PricingCardShell>
        </div>
      )}

      {step === 3 && campaignLoading && campaigns.length === 0 && (
        <SetupScanFrame>
          <ScanOverlay
            compact
            state={scanningState(["Designing campaign angles…"], 28)}
            kicker="Step 3"
            title="Defining campaigns"
            runningLabel="Designing"
          />
        </SetupScanFrame>
      )}

      {step === 3 && campaigns.length > 0 && (
        <div className="mx-auto grid w-full max-w-[760px] gap-3 md:grid-cols-2">
          {campaigns.map((campaign) => (
            <div key={campaign.segmentKey} className="setup-rise">
              <CampaignCard campaign={campaign} />
            </div>
          ))}
          {campaignLoading && <CampaignCardSkeleton />}
        </div>
      )}

      {step === 4 && (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overscroll-contain",
              showScan && "pointer-events-none select-none blur-[2.5px]",
            )}
            aria-hidden={showScan}
          >
            {accountRows.length > 0 ? (
              <ContactsTable
                prospects={accountRows}
                selected={new Set()}
                onSelectedChange={() => {}}
                readOnly
              />
            ) : (
              <p className="py-10 text-center text-sm text-neutral-500">No accounts yet</p>
            )}
          </div>
          {showScan && scan && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/25 px-4">
              <div className="w-[22rem] shrink-0">
                <ScanOverlay
                  compact
                  state={scan}
                  kicker="Step 4"
                  title="Finding accounts & people"
                  runningLabel="Searching"
                  onRetry={() => void findAccounts()}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {step === 5 && (
        <SetupScanFrame>
          <ScanOverlay
            compact
            state={scan ?? scanningState(["Saving campaigns…"], 55)}
            kicker="Step 5"
            title="Opening campaigns"
            runningLabel="Drafting"
            onRetry={() => void finishSetup()}
          />
        </SetupScanFrame>
      )}
      </div>

      {step === 2 && !showScan && (
        <div className="mx-auto flex w-full max-w-[920px] shrink-0 items-center justify-end gap-3 pt-3">
          <ThreeDButton type="button" variant="solid" onClick={() => void loadCampaigns()}>
            Continue
          </ThreeDButton>
        </div>
      )}
      {step === 3 && !campaignLoading && campaigns.length > 0 && (
        <div className="mx-auto flex w-full max-w-[760px] shrink-0 items-center justify-end gap-3 pt-3">
          <ThreeDButton type="button" variant="solid" onClick={() => void findAccounts()}>
            Find accounts
          </ThreeDButton>
        </div>
      )}
      {step === 4 && !showScan && (
        <div className="flex shrink-0 justify-end pt-3">
          <ThreeDButton type="button" variant="solid" onClick={() => void finishSetup()}>
            Continue to campaigns
          </ThreeDButton>
        </div>
      )}
    </div>
  );
}

export function SetupWizard({ initialUrl }: { initialUrl?: string }) {
  return (
    <Suspense fallback={<div className="h-24 animate-pulse rounded-2xl bg-neutral-100" />}>
      <div className="flex min-h-0 flex-1 flex-col">
        <SetupWizardInner initialUrl={initialUrl} />
      </div>
    </Suspense>
  );
}
