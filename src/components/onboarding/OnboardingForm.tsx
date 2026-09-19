"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, Loader2, Globe } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { BlueprintReviewForm, type BlueprintData } from "./BlueprintReviewForm";

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

function OnboardingFormInner({ initialUrl = "" }: { initialUrl?: string }) {
  const searchParams = useSearchParams();
  const [domain, setDomain] = useState(() =>
    stripProtocol(initialUrl || searchParams.get("url") || searchParams.get("websiteUrl") || "")
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<BlueprintData | null>(null);

  const [domainError, setDomainError] = useState(false);
  const valid = useMemo(() => isValidDomain(domain), [domain]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setDomainError(true);
      return;
    }
    const websiteUrl = `https://${stripProtocol(domain)}`;
    setLoading(true);
    setDomainError(false);
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
      <div className="flex flex-col gap-1.5">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 transition-[border-color] focus-within:border-neutral-900">
            <Globe className="size-4 shrink-0 text-neutral-400" aria-hidden />
            <span className="shrink-0 select-none text-sm text-neutral-500">https://</span>
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={domainError}
              className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 disabled:bg-transparent disabled:text-neutral-400"
              placeholder="yourcompany.com"
              value={domain}
              onChange={(e) => {
                setDomainError(false);
                setDomain(stripProtocol(e.target.value));
              }}
              disabled={loading}
            />
          </div>
          <ThreeDButton
            type="submit"
            variant="solid"
            size="md"
            disabled={loading}
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
        {domainError && (
          <p className="text-sm text-red-600">Enter a valid domain like acme.com</p>
        )}
      </div>

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
