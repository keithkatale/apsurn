"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, Loader2, Globe } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { BlueprintReviewForm, type BlueprintData } from "./BlueprintReviewForm";

function OnboardingFormInner({ initialUrl = "" }: { initialUrl?: string }) {
  const searchParams = useSearchParams();
  const [websiteUrl, setWebsiteUrl] = useState(
    () => initialUrl || searchParams.get("url") || searchParams.get("websiteUrl") || ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<BlueprintData | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!websiteUrl.trim()) return;
    setLoading(true);
    setError(null);
    setBlueprint(null);
    try {
      const res = await fetch("/api/onboarding/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setCompanyId(data.company.id);
      setBlueprint(data.blueprint);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">
            <Globe className="size-4" />
          </div>
          <input
            className="input w-full pl-9"
            placeholder="https://yourcompany.com"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            disabled={loading}
          />
        </div>
        <ThreeDButton
          type="submit"
          variant="solid"
          size="md"
          disabled={loading || !websiteUrl.trim()}
          className="whitespace-nowrap"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Analyzing website…</span>
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              <span>Build blueprint</span>
            </>
          )}
        </ThreeDButton>
      </form>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Error analyzing website</p>
          <p className="mt-1 text-red-600">{error}</p>
        </div>
      )}

      {blueprint && companyId && (
        <div className="mt-2">
          <BlueprintReviewForm companyId={companyId} blueprint={blueprint} />
        </div>
      )}
    </div>
  );
}

export function OnboardingForm({ initialUrl }: { initialUrl?: string }) {
  return (
    <Suspense fallback={<div className="h-10 animate-pulse rounded bg-neutral-100" />}>
      <OnboardingFormInner initialUrl={initialUrl} />
    </Suspense>
  );
}
