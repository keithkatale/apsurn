"use client";

import { useEffect, useState } from "react";
import { Check, KeyRound, Trash2 } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

const PROVIDERS = [
  { id: "openai", label: "OpenAI", description: "gpt-5.6-luna. Paid, most reliable tool-calling." },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Default. Free DeepSeek model. Capped at 50 requests/day until the account has $10+ credit.",
  },
  {
    id: "vertex",
    label: "Vertex AI (Gemini)",
    description:
      "Google Cloud Gemini. Needs a real service-account key below to work in production — ADC (a local gcloud login) only works on the machine that ran it, never in a serverless deploy.",
  },
] as const;

export function AiProviderSettings() {
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [vertexConfigured, setVertexConfigured] = useState(false);
  const [vertexEmail, setVertexEmail] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings/ai-provider")
      .then((res) => res.json())
      .then((data) => setActive(data.provider ?? null))
      .catch(() => setError("Could not load the current AI provider."));
    refetchVertexStatus();
  }, []);

  function refetchVertexStatus() {
    fetch("/api/settings/vertex-credentials")
      .then((res) => res.json())
      .then((data) => {
        setVertexConfigured(Boolean(data.configured));
        setVertexEmail(data.clientEmail ?? null);
      })
      .catch(() => {});
  }

  async function selectProvider(provider: string) {
    setSaving(provider);
    setError(null);
    try {
      const res = await fetch("/api/settings/ai-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not switch provider");
      }
      setActive(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch provider");
    } finally {
      setSaving(null);
    }
  }

  async function saveKey() {
    setSavingKey(true);
    setKeyError(null);
    try {
      const res = await fetch("/api/settings/vertex-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: keyDraft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not save the key");
      }
      setKeyDraft("");
      refetchVertexStatus();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : "Could not save the key");
    } finally {
      setSavingKey(false);
    }
  }

  async function removeKey() {
    setSavingKey(true);
    try {
      await fetch("/api/settings/vertex-credentials", { method: "DELETE" });
      refetchVertexStatus();
    } finally {
      setSavingKey(false);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">AI Provider</h2>
      <p className="mb-4 text-sm text-neutral-500">
        Which backend every AI feature (blueprint generation, prospecting, Copilot, Market Insights) routes through.
      </p>

      <div className="flex flex-col gap-2">
        {PROVIDERS.map((p) => {
          const isActive = active === p.id;
          return (
            <div key={p.id} className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => selectProvider(p.id)}
                disabled={saving !== null}
                className={`flex items-start justify-between gap-4 rounded-lg border p-3 text-left transition-colors ${
                  isActive ? "border-blue-200 bg-blue-50" : "border-neutral-200 hover:bg-neutral-50"
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-neutral-900">{p.label}</p>
                  <p className="text-xs text-neutral-500">{p.description}</p>
                </div>
                <div className="shrink-0 pt-0.5">
                  {saving === p.id ? (
                    <span className="text-xs text-neutral-400">Saving…</span>
                  ) : isActive ? (
                    <Check className="size-4 text-blue-700" />
                  ) : (
                    <ThreeDButton type="button" variant="soft" size="sm" onClick={(e) => { e.stopPropagation(); selectProvider(p.id); }}>
                      Use this
                    </ThreeDButton>
                  )}
                </div>
              </button>

              {p.id === "vertex" && (
                <div className="ml-3 flex flex-col gap-2 rounded-lg border border-dashed border-neutral-200 p-3">
                  {vertexConfigured ? (
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-xs text-neutral-600">
                        <KeyRound className="size-3.5 text-emerald-600" />
                        Service account connected{vertexEmail ? `: ${vertexEmail}` : ""}
                      </p>
                      <ThreeDButton type="button" variant="soft" size="sm" disabled={savingKey} onClick={removeKey}>
                        <Trash2 className="size-3.5" />
                        Remove
                      </ThreeDButton>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-neutral-500">
                        Paste the service-account JSON key here — it&apos;s stored in the app&apos;s database, not on any
                        machine, and never needs interactive re-auth. Create one in Google Cloud Console (IAM &amp; Admin
                        → Service Accounts) with the <code className="rounded bg-neutral-100 px-1">Vertex AI User</code>{" "}
                        role, then download its key and paste the full JSON below.
                      </p>
                      <textarea
                        className="input h-24 font-mono text-xs"
                        placeholder='{"type": "service_account", "project_id": "...", ...}'
                        value={keyDraft}
                        onChange={(e) => setKeyDraft(e.target.value)}
                      />
                      {keyError && <p className="text-xs text-red-600">{keyError}</p>}
                      <ThreeDButton
                        type="button"
                        variant="solid"
                        size="sm"
                        className="self-start"
                        disabled={savingKey || !keyDraft.trim()}
                        onClick={saveKey}
                      >
                        {savingKey ? "Saving…" : "Save key"}
                      </ThreeDButton>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
