"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  Check,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { RebuildBlueprintButton } from "@/components/settings/RebuildBlueprintButton";
import type { BlueprintData } from "@/components/onboarding/BlueprintReviewForm";

interface PersonaItem {
  title: string;
  seniority: string;
  painPoints: string[];
  goals: string[];
}

interface BlueprintPayload {
  companyId: string;
  companyName: string;
  icp: {
    industries: string[];
    companySizeRange: string;
    geographies: string[];
    budgetSignals: string[];
  };
  personas: PersonaItem[];
  value_prop: string;
  positioning: string;
  product_summary: string;
  competitors: string[];
  approve: boolean;
}

function listToText(items?: string[] | null): string {
  if (!items || !Array.isArray(items)) return "";
  return items.join(", ");
}

function textToList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function semiColonToList(text: string): string[] {
  return text
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function BusinessView() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [companyId, setCompanyId] = useState<string>("");
  const [companyName, setCompanyName] = useState<string>("");
  const [websiteUrl, setWebsiteUrl] = useState<string | null>(null);
  const [companyStatus, setCompanyStatus] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<string>("model");

  // Form Fields
  const [industries, setIndustries] = useState("");
  const [companySizeRange, setCompanySizeRange] = useState("");
  const [geographies, setGeographies] = useState("");
  const [budgetSignals, setBudgetSignals] = useState("");
  const [valueProp, setValueProp] = useState("");
  const [positioning, setPositioning] = useState("");
  const [productSummary, setProductSummary] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [personas, setPersonas] = useState<PersonaItem[]>([]);

  // Auto-save & save states: "idle" | "unsaved" | "saving" | "saved" | "error"
  const [saveStatus, setSaveStatus] = useState<"idle" | "unsaved" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const isInitialLoad = useRef(true);
  const lastSavedPayloadRef = useRef<string>("");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setLoadError(null);

    fetch("/api/settings/workspace", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!data.company || !data.company.id) {
          setLoading(false);
          return;
        }

        const comp = data.company;
        const bp: BlueprintData | null = comp.blueprint ?? null;

        setCompanyId(comp.id);
        setCompanyName(comp.name ?? "");
        setWebsiteUrl(comp.websiteUrl ?? null);
        setCompanyStatus(comp.status ?? null);
        setGeneratedAt(comp.generatedAt ?? null);
        setApprovedAt(comp.approvedAt ?? null);
        setConfidence(bp?.confidence ?? "model");

        const initIndustries = listToText(bp?.icp?.industries);
        const initSize = bp?.icp?.companySizeRange ?? "";
        const initGeos = listToText(bp?.icp?.geographies);
        const initBudget = listToText(bp?.icp?.budgetSignals);
        const initValueProp = bp?.value_prop ?? "";
        const initPositioning = bp?.positioning ?? "";
        const initProductSummary = bp?.product_summary ?? "";
        const initCompetitors = listToText(bp?.competitors);
        const initPersonas: PersonaItem[] = (bp?.personas ?? []).map((p) => ({
          title: p.title ?? "",
          seniority: p.seniority ?? "",
          painPoints: Array.isArray(p.painPoints) ? p.painPoints : [],
          goals: Array.isArray(p.goals) ? p.goals : [],
        }));

        setIndustries(initIndustries);
        setCompanySizeRange(initSize);
        setGeographies(initGeos);
        setBudgetSignals(initBudget);
        setValueProp(initValueProp);
        setPositioning(initPositioning);
        setProductSummary(initProductSummary);
        setCompetitors(initCompetitors);
        setPersonas(initPersonas);

        const initialPayload = JSON.stringify({
          companyName: comp.name ?? "",
          industries: initIndustries,
          companySizeRange: initSize,
          geographies: initGeos,
          budgetSignals: initBudget,
          valueProp: initValueProp,
          positioning: initPositioning,
          productSummary: initProductSummary,
          competitors: initCompetitors,
          personas: initPersonas,
        });

        lastSavedPayloadRef.current = initialPayload;
        isInitialLoad.current = false;
        setSaveStatus("idle");
        setLoading(false);
      })
      .catch(() => {
        setLoadError("Could not load company blueprint.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const performSave = useCallback(
    async (isManual = false) => {
      if (!companyId) return;

      const currentSnapshot = JSON.stringify({
        companyName,
        industries,
        companySizeRange,
        geographies,
        budgetSignals,
        valueProp,
        positioning,
        productSummary,
        competitors,
        personas,
      });

      if (!isManual && currentSnapshot === lastSavedPayloadRef.current) {
        setSaveStatus("saved");
        return;
      }

      setSaveStatus("saving");
      setSaveError(null);

      const payload: BlueprintPayload = {
        companyId,
        companyName,
        icp: {
          industries: textToList(industries),
          companySizeRange,
          geographies: textToList(geographies),
          budgetSignals: textToList(budgetSignals),
        },
        personas,
        value_prop: valueProp,
        positioning,
        product_summary: productSummary,
        competitors: textToList(competitors),
        approve: true,
      };

      try {
        const res = await fetch("/api/onboarding/blueprint", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to save blueprint");
        }

        lastSavedPayloadRef.current = currentSnapshot;
        setSaveStatus("saved");
        setLastSavedAt(new Date());
      } catch (err) {
        console.error("[BusinessView] save failed", err);
        setSaveStatus("error");
        setSaveError(err instanceof Error ? err.message : "Save failed");
      }
    },
    [
      companyId,
      companyName,
      industries,
      companySizeRange,
      geographies,
      budgetSignals,
      valueProp,
      positioning,
      productSummary,
      competitors,
      personas,
    ],
  );

  // Auto-save: debounced 1500ms after user stops making edits
  useEffect(() => {
    if (isInitialLoad.current || loading || !companyId) return;

    const currentSnapshot = JSON.stringify({
      companyName,
      industries,
      companySizeRange,
      geographies,
      budgetSignals,
      valueProp,
      positioning,
      productSummary,
      competitors,
      personas,
    });

    if (currentSnapshot === lastSavedPayloadRef.current) {
      if (saveStatus !== "saving") {
        setSaveStatus("saved");
      }
      return;
    }

    setSaveStatus("unsaved");

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      performSave(false);
    }, 1500);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    companyName,
    industries,
    companySizeRange,
    geographies,
    budgetSignals,
    valueProp,
    positioning,
    productSummary,
    competitors,
    personas,
    loading,
    companyId,
    performSave,
    saveStatus,
  ]);

  function handleManualSave() {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    performSave(true);
  }

  // Persona handlers
  function addPersona() {
    setPersonas((prev) => [
      ...prev,
      {
        title: "",
        seniority: "Founder",
        painPoints: [],
        goals: [],
      },
    ]);
  }

  function removePersona(index: number) {
    setPersonas((prev) => prev.filter((_, i) => i !== index));
  }

  function updatePersona(index: number, updates: Partial<PersonaItem>) {
    setPersonas((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item)),
    );
  }

  if (loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="size-4 animate-spin text-[#4379EE]" />
          <span>Loading company blueprint…</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-5xl pt-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          <p className="font-semibold">Unable to load blueprint</p>
          <p className="mt-1">{loadError}</p>
          <ThreeDButton
            type="button"
            variant="soft"
            size="sm"
            className="mt-4"
            onClick={loadData}
          >
            Retry
          </ThreeDButton>
        </div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="mx-auto w-full max-w-4xl py-12">
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center dark:border-neutral-800 dark:bg-[#121212]">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-50 text-[#4379EE] dark:bg-neutral-900 dark:text-neutral-100">
            <Building2 className="size-6" />
          </div>
          <h2 className="mt-4 font-heading text-xl font-bold text-neutral-900 dark:text-neutral-100">
            No company blueprint found
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
            Set up your workspace and crawl your company website to automatically generate your
            ideal customer profile, positioning, and buyer personas.
          </p>
          <Link
            href="/setup"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#4379EE] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#3567D6] dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          >
            <Sparkles className="size-4" />
            <span>Generate Blueprint in Setup</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 pb-16">
      {/* Header with Title and Auto-save indicator */}
      <header className="flex flex-col gap-4 border-b border-neutral-200 pb-6 dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <Building2 className="size-7 text-[#4379EE] dark:text-neutral-100" />
            <h1 className="font-heading text-3xl tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-4xl" style={{ fontWeight: 700 }}>
              Business
            </h1>
          </div>
          <p className="mt-1.5 text-sm text-neutral-500 dark:text-neutral-400">
            View and refine your company blueprint. Auto-saves as you type to keep AI prospecting aligned.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Indicator Badge */}
          <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs shadow-xs dark:border-neutral-800 dark:bg-[#121212]">
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                <Loader2 className="size-3.5 animate-spin text-[#4379EE] dark:text-neutral-100" />
                <span>Saving changes…</span>
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                <Check className="size-3.5" />
                <span>
                  All changes saved
                  {lastSavedAt ? ` (${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : ""}
                </span>
              </span>
            )}
            {saveStatus === "unsaved" && (
              <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Unsaved changes (auto-saving…)</span>
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1.5 font-medium text-rose-600 dark:text-rose-400" title={saveError ?? "Error"}>
                <AlertCircle className="size-3.5" />
                <span>Auto-save failed</span>
              </span>
            )}
            {saveStatus === "idle" && (
              <span className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                <Check className="size-3.5 text-neutral-400 dark:text-neutral-500" />
                <span>Blueprint ready</span>
              </span>
            )}
          </div>

          {/* Manual Save Button */}
          <ThreeDButton
            type="button"
            variant="solid"
            size="sm"
            disabled={saveStatus === "saving"}
            onClick={handleManualSave}
          >
            {saveStatus === "saving" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            <span>Save</span>
          </ThreeDButton>

          {/* Rebuild Blueprint Option */}
          <RebuildBlueprintButton websiteUrl={websiteUrl} />
        </div>
      </header>

      {/* Heuristic fallback warning if applicable */}
      {confidence === "heuristic_fallback" && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium">Built with heuristic fallback</p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
              The AI model was unavailable when scraping your website. Review and adjust your target
              criteria below to ensure highest quality prospecting.
            </p>
          </div>
        </div>
      )}

      {/* Section 1: Company Profile & Website */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-[#121212] sm:p-6">
        <div className="flex items-center gap-2 border-b border-neutral-100 pb-4 dark:border-neutral-800">
          <Globe className="size-5 text-neutral-500 dark:text-neutral-400" />
          <h2 className="font-heading text-lg font-bold text-neutral-900 dark:text-neutral-100">Company Details</h2>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Company Name
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-xs focus:border-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Website URL
            </label>
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
              <span className="truncate flex-1 font-mono text-xs">{websiteUrl ?? "—"}</span>
              {websiteUrl && (
                <a
                  href={websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-200"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 border-t border-neutral-100 pt-4 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          <div>
            Status:{" "}
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {companyStatus ?? "ready"}
            </span>
          </div>
          <div>Last generated: <span className="text-neutral-700 dark:text-neutral-300">{formatDate(generatedAt)}</span></div>
          <div>Approved: <span className="text-neutral-700 dark:text-neutral-300">{approvedAt ? formatDate(approvedAt) : "Active"}</span></div>
        </div>
      </section>

      {/* Section 2: Value Proposition & Product Messaging */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-[#121212] sm:p-6">
        <div className="flex items-center gap-2 border-b border-neutral-100 pb-4 dark:border-neutral-800">
          <FileText className="size-5 text-neutral-500 dark:text-neutral-400" />
          <h2 className="font-heading text-lg font-bold text-neutral-900 dark:text-neutral-100">Value Proposition & Product</h2>
        </div>

        <div className="mt-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Product Summary
            </label>
            <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
              A concise summary of what your software does and who it helps.
            </p>
            <textarea
              rows={3}
              value={productSummary}
              onChange={(e) => setProductSummary(e.target.value)}
              placeholder="e.g. An AI-powered prospecting engine for lean B2B SaaS startups..."
              className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-xs focus:border-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Core Value Proposition
            </label>
            <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
              The primary return on investment, time savings, or transformation delivered to customers.
            </p>
            <textarea
              rows={3}
              value={valueProp}
              onChange={(e) => setValueProp(e.target.value)}
              placeholder="e.g. Cuts CAC by replacing manual SDR research with signal-grounded contact discovery..."
              className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-xs focus:border-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Positioning
            </label>
            <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
              How you stand apart from legacy alternatives and direct competitors.
            </p>
            <textarea
              rows={2}
              value={positioning}
              onChange={(e) => setPositioning(e.target.value)}
              placeholder="e.g. Unlike volume-blasting AI SDRs, Apsurn is an evidence-backed research copilot with deliverability shields."
              className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-xs focus:border-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
            />
          </div>
        </div>
      </section>

      {/* Section 3: Ideal Customer Profile (ICP) */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-[#121212] sm:p-6">
        <div className="flex items-center gap-2 border-b border-neutral-100 pb-4 dark:border-neutral-800">
          <Target className="size-5 text-neutral-500 dark:text-neutral-400" />
          <h2 className="font-heading text-lg font-bold text-neutral-900 dark:text-neutral-100">Ideal Customer Profile (ICP)</h2>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Target Industries
            </label>
            <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">Separate multiple industries with commas.</p>
            <input
              type="text"
              value={industries}
              onChange={(e) => setIndustries(e.target.value)}
              placeholder="e.g. B2B SaaS, Developer Tools, FinTech, E-Commerce"
              className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-xs focus:border-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Company Size Range
            </label>
            <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">Target employee band or stage.</p>
            <input
              type="text"
              value={companySizeRange}
              onChange={(e) => setCompanySizeRange(e.target.value)}
              placeholder="e.g. 11-50 employees, Seed to Series A"
              className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-xs focus:border-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Target Geographies
            </label>
            <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">Countries, regions, or state locations.</p>
            <input
              type="text"
              value={geographies}
              onChange={(e) => setGeographies(e.target.value)}
              placeholder="e.g. United States, United Kingdom, Canada, European Union"
              className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-xs focus:border-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
              Budget & Intent Signals
            </label>
            <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">Triggers like hiring, funding, or tech stack.</p>
            <input
              type="text"
              value={budgetSignals}
              onChange={(e) => setBudgetSignals(e.target.value)}
              placeholder="e.g. Recently raised Seed, Hiring Sales/GTM, Uses Stripe"
              className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-xs focus:border-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
            />
          </div>
        </div>
      </section>

      {/* Section 4: Buyer Personas */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-[#121212] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-neutral-500 dark:text-neutral-400" />
            <h2 className="font-heading text-lg font-bold text-neutral-900 dark:text-neutral-100">Buyer Personas</h2>
          </div>
          <ThreeDButton type="button" variant="soft" size="sm" onClick={addPersona}>
            <Plus className="size-3.5" />
            <span>Add persona</span>
          </ThreeDButton>
        </div>

        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Target roles searched when finding verified decision-makers at matching accounts.
        </p>

        {personas.length === 0 ? (
          <div className="mt-5 rounded-lg border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            No personas defined yet. Click &quot;Add persona&quot; to specify your target titles.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {personas.map((persona, index) => (
              <div
                key={index}
                className="relative rounded-lg border border-neutral-200 bg-neutral-50/80 p-4 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900/60 dark:hover:border-neutral-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                        Target Job Title
                      </label>
                      <input
                        type="text"
                        value={persona.title}
                        onChange={(e) => updatePersona(index, { title: e.target.value })}
                        placeholder="e.g. Founder, Head of Growth, VP of Sales"
                        className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-2xs focus:border-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                        Seniority Level
                      </label>
                      <input
                        type="text"
                        value={persona.seniority}
                        onChange={(e) => updatePersona(index, { seniority: e.target.value })}
                        placeholder="e.g. Founder, C-Level, VP, Director"
                        className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-2xs focus:border-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removePersona(index)}
                    className="mt-1 text-neutral-400 hover:text-red-600 dark:text-neutral-500 dark:hover:text-red-400"
                    title="Remove persona"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                      Pain Points (semi-colon separated)
                    </label>
                    <input
                      type="text"
                      value={persona.painPoints.join("; ")}
                      onChange={(e) =>
                        updatePersona(index, { painPoints: semiColonToList(e.target.value) })
                      }
                      placeholder="e.g. High CAC; Outbound emails going to spam"
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 shadow-2xs focus:border-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
                      Goals (semi-colon separated)
                    </label>
                    <input
                      type="text"
                      value={persona.goals.join("; ")}
                      onChange={(e) =>
                        updatePersona(index, { goals: semiColonToList(e.target.value) })
                      }
                      placeholder="e.g. Reach $1M ARR; Consistent qualified pipeline"
                      className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-900 placeholder:text-neutral-400 shadow-2xs focus:border-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 5: Competitors */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-[#121212] sm:p-6">
        <div className="flex items-center gap-2 border-b border-neutral-100 pb-4 dark:border-neutral-800">
          <Building2 className="size-5 text-neutral-500 dark:text-neutral-400" />
          <h2 className="font-heading text-lg font-bold text-neutral-900 dark:text-neutral-100">Competitors & Alternatives</h2>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">
            Competitor Names (comma-separated)
          </label>
          <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
            Used to craft comparative positioning angles and identify switchers.
          </p>
          <input
            type="text"
            value={competitors}
            onChange={(e) => setCompetitors(e.target.value)}
            placeholder="e.g. Apollo, ZoomInfo, Clay, Instantly, Lemlist"
            className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-xs focus:border-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
          />
        </div>
      </section>
    </div>
  );
}
