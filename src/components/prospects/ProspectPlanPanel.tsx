"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import type { ProspectSearchCriteria } from "./ProspectComposeModal";

/**
 * The AI proposes the run, the user approves it.
 *
 * This replaces the blank criteria form. The blueprint already describes who
 * the company sells to, so asking the user to restate that as industry and
 * persona filters was work the app could do itself — and a hand-typed ICP
 * that does not match the blueprint is the main way a run ends up finding
 * nothing. Every field stays editable: this is a proposal to approve or
 * adjust, never something that runs on its own.
 */

interface Plan {
  rationale: string;
  steps: string[];
  criteria: {
    industries: string[];
    geographies: string[];
    personas: string[];
    companySizeRange: string;
  };
  limit: number;
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-neutral-700">{label}</span>
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function ProspectPlanPanel({
  onApprove,
  onTalkToAi,
}: {
  onApprove: (criteria: ProspectSearchCriteria) => void;
  onTalkToAi: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [rationale, setRationale] = useState("");
  const [steps, setSteps] = useState<string[]>([]);

  const [industries, setIndustries] = useState("");
  const [geographies, setGeographies] = useState("");
  const [personas, setPersonas] = useState("");
  const [companySizeRange, setCompanySizeRange] = useState("");
  const [limit, setLimit] = useState(15);

  // The panel mounts on open; without this the plan would be requested twice
  // under React's development double-invoke, costing a duplicate AI call.
  const requestedRef = useRef(false);

  const loadPlan = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/prospecting/plan", { method: "POST" });
      const data = (await res.json()) as { plan?: Plan; error?: string };
      if (!res.ok || !data.plan) throw new Error(data.error ?? "Could not build a plan");

      const { plan } = data;
      setRationale(plan.rationale);
      setSteps(plan.steps);
      setIndustries(plan.criteria.industries.join(", "));
      setGeographies(plan.criteria.geographies.join(", "));
      setPersonas(plan.criteria.personas.join(", "));
      setCompanySizeRange(plan.criteria.companySizeRange);
      setLimit(plan.limit);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build a plan");
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    loadPlan();
  }, [loadPlan]);

  if (phase === "loading") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Sparkles className="size-5 animate-pulse text-blue-600" />
        <p className="text-sm font-medium text-neutral-900">Reading your blueprint…</p>
        <p className="text-xs text-neutral-500">Working out who to target and how to find them.</p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="size-5 text-red-500" />
        <p className="text-sm font-medium text-neutral-900">Couldn&apos;t build a plan</p>
        <p className="text-xs text-neutral-500">{error}</p>
        <div className="mt-1 flex items-center gap-2">
          <ThreeDButton type="button" variant="solid" size="sm" onClick={loadPlan}>
            <RefreshCw className="size-4" />
            <span>Try again</span>
          </ThreeDButton>
          <button type="button" onClick={onTalkToAi} className="text-xs font-medium text-blue-700 hover:underline">
            Talk to the AI instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="pr-8">
        <h1 className="text-base font-semibold text-neutral-900">Here&apos;s the plan</h1>
        <p className="text-xs text-neutral-500">Built from your blueprint. Edit anything, then approve it.</p>
      </div>

      {rationale && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
          <p className="text-xs leading-relaxed text-blue-900">{rationale}</p>
        </div>
      )}

      {steps.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">What the run will do</span>
          <ol className="flex flex-col gap-1.5">
            {steps.map((step, index) => (
              <li key={index} className="flex gap-2 text-xs text-neutral-600">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-semibold text-neutral-500">
                  {index + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-neutral-100 pt-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Targeting</span>
        <Field label="Industries" value={industries} placeholder="e.g. fintech, healthtech" onChange={setIndustries} />
        <Field label="Geographies" value={geographies} placeholder="e.g. United Kingdom" onChange={setGeographies} />
        <Field label="Decision makers" value={personas} placeholder="e.g. Head of Sales" onChange={setPersonas} />
        <Field label="Company size" value={companySizeRange} placeholder="e.g. 11-50 employees" onChange={setCompanySizeRange} />

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">How many companies</span>
          <input
            type="number"
            min={1}
            max={30}
            className="input"
            value={limit}
            onChange={(e) => setLimit(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
          />
        </label>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <ThreeDButton
          type="button"
          variant="solid"
          size="sm"
          className="w-full justify-center"
          onClick={() => onApprove({ industries, geographies, personas, companySizeRange, limit })}
        >
          <Check className="size-4" />
          <span>Approve &amp; run enrichment</span>
        </ThreeDButton>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={loadPlan}
            className="flex items-center gap-1 text-xs font-medium text-neutral-500 hover:text-neutral-800"
          >
            <RefreshCw className="size-3" />
            Suggest another plan
          </button>
          <button
            type="button"
            onClick={onTalkToAi}
            className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
          >
            <MessageCircle className="size-3" />
            Talk to the AI instead
          </button>
        </div>
      </div>
    </div>
  );
}
