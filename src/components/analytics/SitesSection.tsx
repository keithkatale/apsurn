"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Globe } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { trackingSnippet } from "@/lib/analytics/snippet";
import type { AnalyticsSite } from "@/lib/analytics/types";
import { landingCard, landingInput } from "./styles";

export function AddSiteForm({ onCreated }: { onCreated: (site: AnalyticsSite, trackingCode: string) => void }) {
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/analytics/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add site");
      onCreated(data.site, data.trackingCode);
      setDomain("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add site");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Website domain</label>
          <input
            className={landingInput}
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="example.com"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Site name (optional)</label>
          <input
            className={landingInput}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Marketing site"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ThreeDButton type="submit" variant="solid" disabled={loading} className="self-start rounded-xl">
        {loading ? "Adding site…" : "Add site"}
      </ThreeDButton>
    </form>
  );
}

export function SitesSection({
  sites,
  onCreated,
}: {
  sites: AnalyticsSite[];
  onCreated: (site: AnalyticsSite, trackingCode: string) => void;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function copyCode(site: AnalyticsSite) {
    navigator.clipboard.writeText(trackingSnippet(window.location.origin, site.site_id));
    setCopiedId(site.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <section id="sites" className="flex scroll-mt-4 flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Sites</h2>
      <div className={`${landingCard} p-4 sm:p-5`}>
        <AddSiteForm onCreated={onCreated} />
      </div>
      {sites.length > 0 && (
        <div className="flex flex-col gap-3">
          {sites.map((site) => (
            <div key={site.id} className={`flex items-start justify-between gap-4 p-4 ${landingCard}`}>
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-neutral-100">
                  <Globe className="size-5 text-neutral-700" />
                </div>
                <div>
                  <div className="font-medium text-neutral-900">{site.name || site.domain}</div>
                  <p className="flex items-center gap-1 text-sm text-neutral-500">
                    {site.domain}
                    <a href={`https://${site.domain}`} target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-neutral-900">
                      <ExternalLink className="size-3.5" />
                    </a>
                  </p>
                  <p className="mt-2 text-xs text-neutral-500">
                    Added {new Date(site.created_at).toLocaleDateString()} ·{" "}
                    <code className="rounded bg-neutral-100 px-1">{site.site_id}</code>
                  </p>
                </div>
              </div>
              <ThreeDButton variant="soft" size="sm" className="rounded-xl" onClick={() => copyCode(site)}>
                {copiedId === site.id ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copiedId === site.id ? "Copied" : "Copy code"}
              </ThreeDButton>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
