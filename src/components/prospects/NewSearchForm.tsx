"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

function textToList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function NewSearchForm({
  defaultIndustries,
  defaultGeographies,
  defaultCompanySizeRange,
  defaultPersonas,
  defaultOpen = false,
}: {
  defaultIndustries: string[];
  defaultGeographies: string[];
  defaultCompanySizeRange: string;
  defaultPersonas: string[];
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [listName, setListName] = useState("");
  const [industries, setIndustries] = useState(defaultIndustries.join(", "));
  const [geographies, setGeographies] = useState(defaultGeographies.join(", "));
  const [companySizeRange, setCompanySizeRange] = useState(defaultCompanySizeRange);
  const [personas, setPersonas] = useState(defaultPersonas.join(", "));
  const [limit, setLimit] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ runId: string; stage: string; processed: number; target: number; contacts: number } | null>(null);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!listName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/prospecting/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: 1,
          listName,
          limit,
          criteria: {
            industries: textToList(industries),
            geographies: textToList(geographies),
            companySizeRange,
            personas: textToList(personas),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Prospecting failed");
      setProgress({ runId: data.runId, stage: "queued", processed: 0, target: limit, contacts: 0 });
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const statusResponse = await fetch(`/api/prospecting/run/${data.runId}`, { cache: "no-store" });
        const status = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(status.error ?? "Could not read run status");
        setProgress({ runId: data.runId, stage: status.stage, processed: status.processed_count, target: status.target_count, contacts: status.contact_count });
        router.refresh();
        if (["completed", "partial", "failed", "cancelled"].includes(status.status)) {
          if (status.status === "failed") throw new Error(status.error_summary ?? "Prospecting failed");
          setOpen(false); setListName(""); setProgress(null); break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prospecting failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ThreeDButton variant="solid" size="sm" onClick={() => setOpen(true)}>
        <Search className="size-4" />
        <span>Find prospects</span>
      </ThreeDButton>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6">
          <form
            onSubmit={runSearch}
            className="mt-10 flex w-full max-w-lg flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-neutral-900">New prospecting search</h2>
              <ThreeDButton
                type="button"
                variant="soft"
                size="sm"
                onClick={async () => {
                  if (progress) await fetch(`/api/prospecting/run/${progress.runId}/cancel`, { method: "POST" });
                  setOpen(false);
                }}
              >
                Cancel
              </ThreeDButton>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-neutral-700">List name</span>
              <input
                className="input"
                placeholder="e.g. Fintech, 11-50 employees"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-neutral-700">Industries (comma-separated)</span>
              <input
                className="input"
                value={industries}
                onChange={(e) => setIndustries(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-neutral-700">Geographies (comma-separated)</span>
              <input
                className="input"
                value={geographies}
                onChange={(e) => setGeographies(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-neutral-700">Company size range</span>
              <input
                className="input"
                value={companySizeRange}
                onChange={(e) => setCompanySizeRange(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-neutral-700">
                Target job titles (comma-separated, optional)
              </span>
              <input
                className="input"
                value={personas}
                onChange={(e) => setPersonas(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-neutral-700">Number of companies</span>
              <input
                type="number"
                min={1}
                max={30}
                className="input w-24"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
              />
            </label>

            <p className="text-xs text-neutral-500">
              Apsurn searches public business sources and shows provenance and confidence
              for every contact.
            </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {progress && <div className="rounded bg-neutral-50 px-3 py-2 text-sm text-neutral-700"><span className="font-medium capitalize">{progress.stage}</span> · {progress.processed}/{progress.target} companies · {progress.contacts} contacts</div>}

            <ThreeDButton type="submit" variant="solid" disabled={loading} className="self-start">
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Searching… this can take a minute</span>
                </>
              ) : (
                <>
                  <Search className="size-4" />
                  <span>Run search</span>
                </>
              )}
            </ThreeDButton>
          </form>
        </div>
      )}
    </>
  );
}
