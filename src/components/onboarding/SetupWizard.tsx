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

let heroSetupStartedFor = "";
let guestStart: Promise<Response> | null = null;

function ensureGuestSession() {
  if (!guestStart) {
    guestStart = fetch("/api/auth/guest", { method: "POST" }).then((response) => {
      if (!response.ok) guestStart = null;
      return response;
    });
  }
  return guestStart;
}

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

function accountSearchMessage(reason?: string) {
  const text = reason?.trim();
  if (!text || text === "target reached") return "No accounts matched this search.";
  if (/credit/i.test(text)) return "Add a card to start with 50 free credits before more leads can be saved.";
  return text;
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

function displayCompanyName(name: unknown, domain: string) {
  if (typeof name === "string" && name.trim()) return name.trim();
  const host = stripProtocol(domain).split(".")[0] ?? "";
  if (!host) return domain;
  return host.charAt(0).toUpperCase() + host.slice(1);
}

function BlueprintFact({ label, value, className }: { label: string; value: string; className?: string }) {
  const text = value.trim();
  if (!text) return null;
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-[11px] font-medium text-neutral-500">{label}</span>
      <p className="whitespace-pre-wrap text-[13px] leading-snug text-neutral-900">{text}</p>
    </div>
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
  const [companyName, setCompanyName] = useState("");
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
  const [competitorsReady, setCompetitorsReady] = useState(false);
  const [accountsReady, setAccountsReady] = useState(false);
  const confirmLock = useRef(false);
  const fromQuery = useRef(
    Boolean(initialUrl || searchParams.get("url") || searchParams.get("websiteUrl")),
  );
  const advanceRef = useRef({
    approveAndContinue: () => {},
    loadCampaigns: () => {},
    findAccounts: () => {},
    finishSetup: () => {},
  });

  const valid = useMemo(() => isValidDomain(domain), [domain]);

  useEffect(() => {
    if (!fromQuery.current || !isValidDomain(domain) || heroSetupStartedFor === domain) return;
    heroSetupStartedFor = domain;
    void analyze();
    // The hero URL should start the same analysis the setup field runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

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

  async function analyze(e?: React.FormEvent) {
    e?.preventDefault();
    if (!isValidDomain(domain)) {
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
      const guest = await ensureGuestSession();
      if (!guest.ok) {
        const guestBody = (await guest.json().catch(() => null)) as { error?: string } | null;
        throw new Error(guestBody?.error || "Could not start setup");
      }
      const res = await fetch("/api/onboarding/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: `https://${stripProtocol(domain)}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not analyze the website");
      setCompanyId(data.company.id);
      setCompanyName(displayCompanyName(data.company?.name, domain));
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
    setCompetitorsReady(false);
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
      setCompetitorsReady(true);
      setScan(null);
    } catch (err) {
      setCompetitorsReady(false);
      setScan({
        phase: "error",
        progress: 100,
        logs: [],
        error: err instanceof Error ? err.message : "Could not save blueprint",
      });
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
    setAccountsReady(false);
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
            preferYcLeads: true,
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
              stopReason?: string;
              error?: string;
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
            if (event.type === "error") {
              throw new Error(event.error ?? "Could not find accounts");
            }
            if (event.type === "done") {
              const found = event.found ?? 0;
              if (found === 0) {
                throw new Error(accountSearchMessage(event.stopReason));
              }
              setScan({
                phase: "done",
                progress: 100,
                logs: [{ id: uid(), text: `Saved ${found} companies · ${event.contactCount ?? 0} people` }],
              });
            }
          } catch (err) {
            if (err instanceof SyntaxError) continue;
            throw err;
          }
        }
        const now = Date.now();
        if (now - lastPoll > 2500) {
          lastPoll = now;
          await refresh();
        }
      }
      await refresh();
      setAccountsReady(true);
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

  const showScan = Boolean(scan && (scan.phase === "scanning" || scan.phase === "error"));
  const blueprintReview = step === 1 && started && Boolean(blueprint) && !showScan;

  advanceRef.current = {
    approveAndContinue: () => {
      void approveAndContinue();
    },
    loadCampaigns: () => {
      void loadCampaigns();
    },
    findAccounts: () => {
      void findAccounts();
    },
    finishSetup: () => {
      void finishSetup();
    },
  };

  useEffect(() => {
    if (step !== 1 || !blueprintReview) return;
    const id = window.setTimeout(() => advanceRef.current.approveAndContinue(), 3000);
    return () => window.clearTimeout(id);
  }, [step, blueprintReview]);

  useEffect(() => {
    if (step !== 2 || !competitorsReady || showScan) return;
    const id = window.setTimeout(() => advanceRef.current.loadCampaigns(), 2000);
    return () => window.clearTimeout(id);
  }, [step, competitorsReady, showScan]);

  useEffect(() => {
    if (step !== 3 || campaignLoading || campaigns.length === 0 || error) return;
    const id = window.setTimeout(() => advanceRef.current.findAccounts(), 2000);
    return () => window.clearTimeout(id);
  }, [step, campaignLoading, campaigns.length, error]);

  useEffect(() => {
    if (step !== 4 || !accountsReady || showScan) return;
    const id = window.setTimeout(() => advanceRef.current.finishSetup(), 2000);
    return () => window.clearTimeout(id);
  }, [step, accountsReady, showScan]);

  const competitorNames = textToList(competitorsText);
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
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button
            type="button"
            className="shrink-0 font-medium underline"
            onClick={() => {
              setError(null);
              if (step === 3) void loadCampaigns();
              if (step === 4) void findAccounts();
              if (step === 5) void finishSetup();
            }}
          >
            Try again
          </button>
        </div>
      )}

      <div
        className={cn(
          "min-h-0 flex-1",
          step === 1 && !started && "flex items-center justify-center pb-[8vh]",
          scanCentered || step === 4
            ? "flex flex-col overflow-hidden"
            : blueprintReview
              ? "flex items-center justify-center overflow-y-auto"
              : step === 1 && !started
                ? ""
                : "overflow-y-auto overscroll-contain",
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

      {blueprintReview && blueprint && (
        <div className="setup-rise mx-auto flex w-full max-w-xl flex-col items-center px-1 py-4">
          <PricingCardShell highlight className="h-auto w-full p-2.5" innerClassName="flex-none gap-3 p-3 sm:p-3.5">
            <div className="flex items-center gap-3">
              <CompanyFavicon domain={domain} name={companyName || domain} className="size-10 rounded-lg text-sm" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4379EE]">Company blueprint</p>
                <h2 className="truncate text-[17px] font-semibold tracking-[-0.03em] text-neutral-900">
                  {companyName || domain}
                </h2>
              </div>
            </div>
            {blueprint.confidence === "heuristic_fallback" && (
              <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                Built with a fallback model.
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <BlueprintFact label="Target industries" value={industries} className="sm:col-span-2" />
              <BlueprintFact label="Company size" value={companySizeRange} />
              <BlueprintFact label="Geographies" value={geographies} />
            </div>
            <BlueprintFact label="Value proposition" value={valueProp} />
            <BlueprintFact label="Positioning" value={positioning} />
            <BlueprintFact label="Product summary" value={productSummary} />
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
          <ScanOverlay
            compact
            state={scan!}
            kicker="Step 2"
            title="Exploring competitors"
            runningLabel="Listing"
            onRetry={() => void approveAndContinue()}
          />
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
                    <li className="text-[13px] text-neutral-500">None found yet.</li>
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
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {accountRows.length > 0 ? (
              <ContactsTable
                prospects={accountRows}
                selected={new Set()}
                onSelectedChange={() => {}}
                readOnly
                maskEmails={showScan}
              />
            ) : (
              <p className="py-10 text-center text-sm text-neutral-500">No accounts yet</p>
            )}
          </div>
          {showScan && scan && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4">
              <div className="pointer-events-auto w-[22rem] shrink-0">
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
