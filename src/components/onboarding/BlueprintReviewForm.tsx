"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

export interface BlueprintData {
  company_id: string;
  icp: {
    industries: string[];
    companySizeRange: string;
    geographies: string[];
    budgetSignals: string[];
  };
  personas: Array<{
    title: string;
    seniority: string;
    painPoints: string[];
    goals: string[];
  }>;
  value_prop: string | null;
  positioning: string | null;
  product_summary: string | null;
  competitors: string[];
  confidence: "model" | "heuristic_fallback";
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

export function BlueprintReviewForm({
  companyId,
  blueprint,
}: {
  companyId: string;
  blueprint: BlueprintData;
}) {
  const [industries, setIndustries] = useState(listToText(blueprint.icp.industries));
  const [companySizeRange, setCompanySizeRange] = useState(blueprint.icp.companySizeRange);
  const [geographies, setGeographies] = useState(listToText(blueprint.icp.geographies));
  const [valueProp, setValueProp] = useState(blueprint.value_prop ?? "");
  const [positioning, setPositioning] = useState(blueprint.positioning ?? "");
  const [productSummary, setProductSummary] = useState(blueprint.product_summary ?? "");
  const [competitors, setCompetitors] = useState(listToText(blueprint.competitors));
  const [saving, setSaving] = useState(false);
  const [approved, setApproved] = useState(false);
  const router = useRouter();

  async function save(approve: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/blueprint", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          icp: {
            industries: textToList(industries),
            companySizeRange,
            geographies: textToList(geographies),
            budgetSignals: blueprint.icp.budgetSignals,
          },
          value_prop: valueProp,
          positioning,
          product_summary: productSummary,
          competitors: textToList(competitors),
          approve,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      if (approve) {
        setApproved(true);
        router.push("/dashboard");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-lg border border-neutral-200 bg-white p-6">
      {blueprint.confidence === "heuristic_fallback" && (
        <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          The AI model was unavailable, so this blueprint was built with a basic heuristic
          fallback. Review it carefully before approving.
        </p>
      )}

      <Field label="Target industries (comma-separated)">
        <input
          className="input"
          value={industries}
          onChange={(e) => setIndustries(e.target.value)}
        />
      </Field>

      <Field label="Company size range">
        <input
          className="input"
          value={companySizeRange}
          onChange={(e) => setCompanySizeRange(e.target.value)}
        />
      </Field>

      <Field label="Target geographies (comma-separated)">
        <input
          className="input"
          value={geographies}
          onChange={(e) => setGeographies(e.target.value)}
        />
      </Field>

      <Field label="Value proposition">
        <textarea
          className="input min-h-20"
          value={valueProp}
          onChange={(e) => setValueProp(e.target.value)}
        />
      </Field>

      <Field label="Positioning">
        <textarea
          className="input min-h-20"
          value={positioning}
          onChange={(e) => setPositioning(e.target.value)}
        />
      </Field>

      <Field label="Product summary">
        <textarea
          className="input min-h-20"
          value={productSummary}
          onChange={(e) => setProductSummary(e.target.value)}
        />
      </Field>

      <Field label="Competitors (comma-separated)">
        <input
          className="input"
          value={competitors}
          onChange={(e) => setCompetitors(e.target.value)}
        />
      </Field>

      {blueprint.personas.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-neutral-700">Personas</span>
          {blueprint.personas.map((p, i) => (
            <div key={i} className="rounded border border-neutral-200 p-3 text-sm">
              <div className="font-medium">
                {p.title} <span className="text-neutral-500">({p.seniority})</span>
              </div>
              {p.painPoints.length > 0 && (
                <div className="mt-1 text-neutral-600">
                  Pain points: {p.painPoints.join("; ")}
                </div>
              )}
              {p.goals.length > 0 && (
                <div className="text-neutral-600">Goals: {p.goals.join("; ")}</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <ThreeDButton
          variant="soft"
          size="md"
          disabled={saving}
          onClick={() => save(false)}
        >
          <Save className="size-4" />
          <span>Save changes</span>
        </ThreeDButton>
        <ThreeDButton
          variant="solid"
          size="md"
          disabled={saving}
          onClick={() => save(true)}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          <span>{approved ? "Approved ✓" : "Approve blueprint"}</span>
        </ThreeDButton>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}
