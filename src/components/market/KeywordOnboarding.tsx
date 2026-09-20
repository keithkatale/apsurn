"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { DEFAULT_MARKET_PLATFORMS, MARKET_PLATFORMS, type MarketPlatform } from "@/lib/market/types";
import { PLATFORM_LABEL } from "./PlatformBadge";

export function KeywordOnboarding({ onAdded }: { onAdded: () => void }) {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [platforms, setPlatforms] = useState<MarketPlatform[]>([...DEFAULT_MARKET_PLATFORMS]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addKeyword() {
    const value = draft.trim();
    if (!value || keywords.includes(value)) return;
    setKeywords((prev) => [...prev, value]);
    setDraft("");
  }

  function removeKeyword(value: string) {
    setKeywords((prev) => prev.filter((k) => k !== value));
  }

  function togglePlatform(platform: MarketPlatform) {
    setPlatforms((prev) => (prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]));
  }

  async function submit() {
    if (keywords.length === 0 || platforms.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      for (const keyword of keywords) {
        const res = await fetch("/api/market/keywords", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword, platforms }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Could not save keyword");
        }
      }
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save keywords");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 py-12">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">Track what people are saying</h1>
        <p className="text-sm text-neutral-500">
          List a few keywords to track — your brand, product, or topics you care about. We&apos;ll keep scanning X/Twitter,
          Reddit, YouTube, and LinkedIn for public mentions.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-neutral-700">Keywords</span>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="e.g. your brand name, product, or topic"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addKeyword();
              }
            }}
          />
          <ThreeDButton type="button" variant="soft" size="sm" onClick={addKeyword}>
            <Plus className="size-4" />
            <span>Add</span>
          </ThreeDButton>
        </div>

        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {keywords.map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
              >
                {k}
                <button type="button" onClick={() => removeKeyword(k)} aria-label={`Remove ${k}`}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-neutral-700">Platforms to listen on</span>
        <div className="flex flex-wrap gap-2">
          {MARKET_PLATFORMS.map((platform) => (
            <label
              key={platform}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                platforms.includes(platform) ? "border-blue-300 bg-blue-50 text-blue-700" : "border-neutral-200 text-neutral-600"
              }`}
            >
              <input
                type="checkbox"
                className="size-3.5"
                checked={platforms.includes(platform)}
                onChange={() => togglePlatform(platform)}
              />
              {PLATFORM_LABEL[platform]}
            </label>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ThreeDButton
        type="button"
        variant="solid"
        className="self-start"
        disabled={keywords.length === 0 || platforms.length === 0 || saving}
        onClick={submit}
      >
        {saving ? "Saving…" : "Start tracking"}
      </ThreeDButton>
    </div>
  );
}
