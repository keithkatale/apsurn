"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Plus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import { FilterDropdown, type FilterOption } from "./FilterDropdown";
import { KeywordOnboarding } from "./KeywordOnboarding";
import { MentionCard } from "./MentionCard";
import { MentionPanel } from "./MentionPanel";
import { MarketScanOverlay, type ScanState } from "./MarketScanOverlay";
import { PLATFORM_LABEL } from "./PlatformBadge";
import { SaveLeadModal } from "./SaveLeadModal";
import type { MarketMentionWithKeyword } from "./types";
import {
  DEFAULT_MARKET_PLATFORMS,
  MARKET_PLATFORMS,
  type MarketAccountRow,
  type MarketKeywordRow,
  type MarketPlatform,
} from "@/lib/market/types";

let scanLogUid = 0;
function nextScanLogId(): string {
  scanLogUid += 1;
  return `scan-log-${Date.now()}-${scanLogUid}`;
}

/** Stable identity for a post author across scans: accounts are no longer stored per discovered author. */
function authorKeyOf(platform: string, handle: string | null | undefined): string | null {
  return handle ? `${platform}:${handle}` : null;
}

export function MarketInsightsWorkspace({
  initialKeywords,
  initialAccounts,
  initialMentions,
  initialCursor,
}: {
  initialKeywords: MarketKeywordRow[];
  initialAccounts: MarketAccountRow[];
  initialMentions: MarketMentionWithKeyword[];
  initialCursor: string | null;
}) {
  const [keywords, setKeywords] = useState<MarketKeywordRow[]>(initialKeywords);
  const [accounts, setAccounts] = useState<MarketAccountRow[]>(initialAccounts);
  const [mentions, setMentions] = useState<MarketMentionWithKeyword[]>(initialMentions);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedMentionId, setSelectedMentionId] = useState<string | null>(null);
  const [scanState, setScanState] = useState<ScanState | null>(null);
  const [addingKeyword, setAddingKeyword] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [newPlatforms, setNewPlatforms] = useState<MarketPlatform[]>([...DEFAULT_MARKET_PLATFORMS]);
  const [savingKeyword, setSavingKeyword] = useState(false);
  const [keywordFilter, setKeywordFilter] = useState<Set<string>>(new Set());
  const [platformFilter, setPlatformFilter] = useState<Set<MarketPlatform>>(new Set());
  // Keyed by "<platform>:<handle>" rather than by a market_accounts id, so
  // the filter covers every author in the feed, not just stored accounts.
  const [accountFilter, setAccountFilter] = useState<Set<string>>(new Set());
  const [followedKeys, setFollowedKeys] = useState<Set<string>>(
    () => new Set(initialAccounts.filter((a) => a.is_followed).map((a) => `${a.platform}:${a.handle}`))
  );
  const [followingOnly, setFollowingOnly] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [scanPlatformsOpen, setScanPlatformsOpen] = useState(false);
  const [scanPlatforms, setScanPlatforms] = useState<Set<MarketPlatform>>(new Set(DEFAULT_MARKET_PLATFORMS));
  const [saveTargetId, setSaveTargetId] = useState<string | null>(null);
  const [savedOnly, setSavedOnly] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/market/mentions?before=${encodeURIComponent(cursor)}`);
      const data = await res.json();
      if (Array.isArray(data.mentions)) {
        setMentions((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          return [...prev, ...data.mentions.filter((m: MarketMentionWithKeyword) => !existingIds.has(m.id))];
        });
      }
      setCursor(data.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const refetchKeywordsAndAccounts = useCallback(async () => {
    const [keywordsRes, accountsRes] = await Promise.all([fetch("/api/market/keywords"), fetch("/api/market/accounts")]);
    const [keywordsData, accountsData] = await Promise.all([keywordsRes.json(), accountsRes.json()]);
    if (Array.isArray(keywordsData.keywords)) setKeywords(keywordsData.keywords);
    if (Array.isArray(accountsData.accounts)) {
      const rows = accountsData.accounts as MarketAccountRow[];
      setAccounts(rows);
      setFollowedKeys(new Set(rows.filter((a) => a.is_followed).map((a) => `${a.platform}:${a.handle}`)));
    }
  }, []);

  const refetchFirstPage = useCallback(async () => {
    const res = await fetch("/api/market/mentions");
    const data = await res.json();
    if (Array.isArray(data.mentions)) {
      setMentions((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const fresh = data.mentions.filter((m: MarketMentionWithKeyword) => !existingIds.has(m.id));
        // Merge: brand-new mentions float to the top; anything already in view keeps its place.
        const freshIds = new Set(fresh.map((m: MarketMentionWithKeyword) => m.id));
        const merged = prev.map((m) => data.mentions.find((n: MarketMentionWithKeyword) => n.id === m.id) ?? m);
        return [...fresh, ...merged.filter((m) => !freshIds.has(m.id))];
      });
      if (mentions.length === 0) setCursor(data.nextCursor ?? null);
    }
  }, [mentions.length]);

  async function runScan(platforms?: MarketPlatform[]) {
    const localLogs: { id: string; text: string }[] = [];
    setScanState({ phase: "scanning", progress: 0, logs: [] });

    try {
      const res = await fetch("/api/market/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Scan failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawTerminalEvent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const event = JSON.parse(line.slice(5).trim());

          if (event.type === "progress") {
            localLogs.push({ id: nextScanLogId(), text: event.label });
            setScanState({ phase: "scanning", progress: event.progress, logs: localLogs.slice(-18) });
          } else if (event.type === "done") {
            sawTerminalEvent = true;
            // Partial failures still return `done` — surface them rather than
            // letting a half-empty scan look like a clean one.
            const failures: string[] = Array.isArray(event.failures) ? event.failures : [];
            for (const failure of failures) localLogs.push({ id: nextScanLogId(), text: failure });
            setScanState({
              phase: failures.length > 0 ? "error" : "done",
              progress: 100,
              logs: localLogs.slice(-18),
              error:
                failures.length > 0
                  ? `${failures.length} source${failures.length === 1 ? "" : "s"} failed to scan.`
                  : undefined,
            });
            await Promise.all([refetchFirstPage(), refetchKeywordsAndAccounts()]);
            if (failures.length === 0) setTimeout(() => setScanState(null), 700);
          } else if (event.type === "error") {
            sawTerminalEvent = true;
            setScanState({ phase: "error", progress: 0, logs: localLogs.slice(-18), error: event.error });
          }
        }
      }

      // Stream ended with no terminal event: the connection dropped mid-scan.
      if (!sawTerminalEvent) {
        setScanState({
          phase: "error",
          progress: 0,
          logs: localLogs.slice(-18),
          error: "The connection to the server was lost before the scan finished.",
        });
      }
    } catch (err) {
      setScanState({
        phase: "error",
        progress: 0,
        logs: localLogs.slice(-18),
        error: err instanceof Error ? err.message : "Scan failed",
      });
    }
  }

  async function clearInsights() {
    setClearing(true);
    try {
      await fetch("/api/market/mentions", { method: "DELETE" });
      setMentions((prev) => prev.filter((m) => m.is_saved));
      setCursor(null);
    } finally {
      setClearing(false);
    }
  }

  async function handleOnboarded() {
    setScanState({ phase: "scanning", progress: 0, logs: [] });
    await refetchKeywordsAndAccounts();
    runScan();
  }

  async function addKeyword() {
    const keyword = newKeyword.trim();
    if (!keyword || newPlatforms.length === 0) return;
    setSavingKeyword(true);
    try {
      await fetch("/api/market/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, platforms: newPlatforms }),
      });
      setNewKeyword("");
      setAddingKeyword(false);
      await refetchKeywordsAndAccounts();
    } finally {
      setSavingKeyword(false);
    }
  }

  async function removeKeyword(id: string) {
    setKeywords((prev) => prev.filter((k) => k.id !== id));
    await fetch(`/api/market/keywords/${id}`, { method: "DELETE" });
  }

  async function patchMention(
    id: string,
    patch: {
      is_saved?: boolean;
      needs_follow_up?: boolean;
      saved_account_name?: string | null;
      save_note?: string | null;
      saved_at?: string | null;
      author_name?: string;
    }
  ) {
    setMentions((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    await fetch(`/api/market/mentions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  async function saveLead(id: string, input: { accountName: string; note: string }) {
    const savedAt = new Date().toISOString();
    await patchMention(id, {
      is_saved: true,
      saved_account_name: input.accountName,
      save_note: input.note || null,
      saved_at: savedAt,
      author_name: input.accountName,
    });
    const mention = mentions.find((m) => m.id === id);
    if (mention?.account_id) {
      setAccounts((prev) =>
        prev.map((a) => (a.id === mention.account_id ? { ...a, name: input.accountName } : a))
      );
    }
    setSaveTargetId(null);
  }

  /**
   * `authorKey` is "<platform>:<handle>". Following creates the account row
   * if there isn't one yet, since scans no longer create them.
   */
  async function toggleFollowAccount(authorKey: string) {
    const separator = authorKey.indexOf(":");
    if (separator < 0) return;
    const platform = authorKey.slice(0, separator) as MarketPlatform;
    const handle = authorKey.slice(separator + 1);

    const existing = accounts.find((a) => authorKeyOf(a.platform, a.handle) === authorKey);
    const nextFollowed = !(existing?.is_followed ?? false);
    const source = mentions.find((m) => authorKeyOf(m.platform, m.author_handle) === authorKey);

    setFollowedKeys((prev) => {
      const next = new Set(prev);
      if (nextFollowed) next.add(authorKey);
      else next.delete(authorKey);
      return next;
    });

    const res = await fetch("/api/market/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform,
        handle,
        name: source?.author_name ?? existing?.name ?? null,
        avatarUrl: source?.author_avatar_url ?? existing?.avatar_url ?? null,
        is_followed: nextFollowed,
      }),
    });

    if (!res.ok) {
      // Put the toggle back rather than leaving the UI claiming a follow that did not happen.
      setFollowedKeys((prev) => {
        const next = new Set(prev);
        if (nextFollowed) next.delete(authorKey);
        else next.add(authorKey);
        return next;
      });
      return;
    }

    const { account } = (await res.json()) as { account?: MarketAccountRow };
    if (account) {
      setAccounts((prev) => {
        const rest = prev.filter((a) => a.id !== account.id);
        return [account, ...rest];
      });
    }
  }

  function toggleSetValue<T>(set: Set<T>, value: T, setState: (next: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setState(next);
  }

  const selectedMention = useMemo(() => mentions.find((m) => m.id === selectedMentionId) ?? null, [mentions, selectedMentionId]);

  const visibleMentions = useMemo(
    () =>
      mentions.filter((m) => {
        const authorKey = authorKeyOf(m.platform, m.author_handle);
        const account = m.account_id ? accountById.get(m.account_id) : null;
        const followed = account?.is_followed ?? (authorKey ? followedKeys.has(authorKey) : false);
        return (
          (keywordFilter.size === 0 || (m.market_keywords && keywordFilter.has(m.market_keywords.keyword))) &&
          (platformFilter.size === 0 || platformFilter.has(m.platform)) &&
          (accountFilter.size === 0 || (authorKey !== null && accountFilter.has(authorKey))) &&
          (!followingOnly || followed) &&
          (!savedOnly || m.is_saved)
        );
      }),
    [mentions, keywordFilter, platformFilter, accountFilter, followingOnly, savedOnly, accountById, followedKeys]
  );

  const activeFilterCount = keywordFilter.size + platformFilter.size + accountFilter.size + (followingOnly ? 1 : 0) + (savedOnly ? 1 : 0);

  function clearFilters() {
    setKeywordFilter(new Set());
    setPlatformFilter(new Set());
    setAccountFilter(new Set());
    setFollowingOnly(false);
    setSavedOnly(false);
  }

  // Built from the authors actually present in the feed, not from the
  // market_accounts table. Scans no longer store a row per discovered author
  // (that filled the database and listed everyone here), so the accounts
  // table now holds only what the user chose to follow.
  const accountOptions: FilterOption[] = useMemo(() => {
    const byKey = new Map<string, FilterOption>();
    for (const m of mentions) {
      const key = authorKeyOf(m.platform, m.author_handle);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, {
        id: key,
        label: m.author_name || m.author_handle || key,
        avatarUrl: m.author_avatar_url,
        isFollowed: followedKeys.has(key),
      });
    }
    // Followed accounts stay listed even when nothing of theirs is in view,
    // so the follow can still be undone from here.
    for (const a of accounts) {
      const key = authorKeyOf(a.platform, a.handle);
      if (!key) continue;
      const existing = byKey.get(key);
      if (existing) existing.isFollowed = a.is_followed;
      else if (a.is_followed) byKey.set(key, { id: key, label: a.name || a.handle, avatarUrl: a.avatar_url, isFollowed: true });
    }
    return [...byKey.values()].sort((a, b) => Number(b.isFollowed) - Number(a.isFollowed) || a.label.localeCompare(b.label));
  }, [mentions, accounts, followedKeys]);

  function openMentionPanel(id: string) {
    setAiOpen(false);
    setSelectedMentionId(id);
  }

  function toggleAiPanel() {
    setSelectedMentionId(null);
    setAiOpen((v) => !v);
  }

  function togglePin(id: string) {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pinnedMentions = useMemo(() => mentions.filter((m) => pinnedIds.has(m.id)), [mentions, pinnedIds]);

  const buildAiContext = useCallback(() => {
    const lines = [
      "The user is viewing the Market Insights tab.",
      `Tracked keywords: ${keywords.map((k) => k.keyword).join(", ") || "none"}.`,
      `${visibleMentions.length} of ${mentions.length} loaded mentions are currently visible given active filters.`,
    ];
    if (activeFilterCount > 0) {
      const platformNames = [...platformFilter].map((p) => PLATFORM_LABEL[p]);
      const accountNames = [...accountFilter].map((key) => key.slice(key.indexOf(":") + 1));
      lines.push(
        `Active filters — platforms: ${platformNames.join(", ") || "none"}; accounts: ${accountNames.join(", ") || "none"}; keywords: ${[...keywordFilter].join(", ") || "none"}; following only: ${followingOnly}.`
      );
    }
    if (pinnedMentions.length > 0) {
      lines.push("Posts the user pinned for you to reference:");
      for (const m of pinnedMentions) {
        lines.push(`- [id ${m.id}] [${m.platform}] ${m.author_name || m.author_handle || "unknown author"}: "${m.content.slice(0, 300)}" (${m.url})`);
      }
    }
    return lines.join("\n");
  }, [keywords, mentions, visibleMentions, activeFilterCount, platformFilter, accountFilter, keywordFilter, followingOnly, pinnedMentions]);

  const rightPanelOpen = selectedMention !== null || aiOpen;

  if (keywords.length === 0 && !scanState) {
    return (
      <div className="-m-8 h-[calc(100%+4rem)] overflow-y-auto bg-white px-6">
        <KeywordOnboarding onAdded={handleOnboarded} />
      </div>
    );
  }

  return (
    <div className="relative -m-8 flex h-[calc(100%+4rem)] overflow-hidden bg-white">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-neutral-900">Market Insights</h1>
              <p className="text-sm text-neutral-500">
                {mentions.length > 0 ? `${mentions.length} mention${mentions.length === 1 ? "" : "s"} found` : "No mentions yet"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ThreeDButton
                type="button"
                variant="soft"
                size="sm"
                disabled={clearing || mentions.every((m) => m.is_saved)}
                onClick={clearInsights}
              >
                <Trash2 className="size-4" />
                <span>{clearing ? "Clearing…" : "Clear"}</span>
              </ThreeDButton>
              <div className="relative">
                <ThreeDButton
                  type="button"
                  variant="solid"
                  size="sm"
                  disabled={scanState?.phase === "scanning"}
                  onClick={() => setScanPlatformsOpen((v) => !v)}
                >
                  <RefreshCw className={`size-4 ${scanState?.phase === "scanning" ? "animate-spin" : ""}`} />
                  <span>{scanState?.phase === "scanning" ? "Scanning…" : "Scan now"}</span>
                  <ChevronDown className="size-3.5" />
                </ThreeDButton>

                {scanPlatformsOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setScanPlatformsOpen(false)} />
                    <div className="absolute right-0 top-9 z-20 flex w-56 flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
                      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Platforms to scan</span>
                      {MARKET_PLATFORMS.map((platform) => (
                        <button
                          key={platform}
                          type="button"
                          onClick={() =>
                            setScanPlatforms((prev) => {
                              const next = new Set(prev);
                              if (next.has(platform)) next.delete(platform);
                              else next.add(platform);
                              return next;
                            })
                          }
                          className="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                        >
                          {PLATFORM_LABEL[platform]}
                          {scanPlatforms.has(platform) && <Check className="size-3.5 text-blue-700" />}
                        </button>
                      ))}
                      <ThreeDButton
                        type="button"
                        variant="solid"
                        size="sm"
                        disabled={scanPlatforms.size === 0}
                        onClick={() => {
                          setScanPlatformsOpen(false);
                          runScan([...scanPlatforms]);
                        }}
                      >
                        Start scan
                      </ThreeDButton>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {scanState && <MarketScanOverlay state={scanState} onRetry={runScan} />}

          <div className="flex flex-wrap items-center gap-1.5">
            <FilterDropdown
              label="Source"
              options={MARKET_PLATFORMS.map((p) => ({ id: p, label: PLATFORM_LABEL[p] }))}
              selected={platformFilter}
              onToggle={(id) => toggleSetValue(platformFilter, id as MarketPlatform, setPlatformFilter)}
            />
            <FilterDropdown
              label="From"
              options={accountOptions}
              selected={accountFilter}
              onToggle={(id) => toggleSetValue(accountFilter, id, setAccountFilter)}
              onToggleFollow={toggleFollowAccount}
            />
            <FilterDropdown
              label="Keywords"
              options={keywords.map((k) => ({ id: k.keyword, label: k.keyword }))}
              selected={keywordFilter}
              onToggle={(id) => toggleSetValue(keywordFilter, id, setKeywordFilter)}
            />
            <button
              type="button"
              onClick={() => setFollowingOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                followingOnly ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
              }`}
            >
              Following only
            </button>
            <button
              type="button"
              onClick={() => setSavedOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                savedOnly ? "border-blue-200 bg-blue-50 text-blue-700" : "border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
              }`}
            >
              Saved leads
            </button>
            {activeFilterCount > 0 && (
              <button type="button" onClick={clearFilters} className="text-xs font-medium text-neutral-500 underline">
                Clear filters
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {keywords.map((k) => (
              <span
                key={k.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
              >
                {k.keyword}
                <button type="button" onClick={() => removeKeyword(k.id)} aria-label={`Stop tracking ${k.keyword}`}>
                  <X className="size-3" />
                </button>
              </span>
            ))}

            {addingKeyword ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  className="input h-8 w-40 text-xs"
                  placeholder="New keyword…"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                />
                {MARKET_PLATFORMS.map((platform) => (
                  <label key={platform} className="flex items-center gap-1 text-[11px] text-neutral-500">
                    <input
                      type="checkbox"
                      className="size-3"
                      checked={newPlatforms.includes(platform)}
                      onChange={() =>
                        setNewPlatforms((prev) =>
                          prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
                        )
                      }
                    />
                    {PLATFORM_LABEL[platform]}
                  </label>
                ))}
                <ThreeDButton type="button" variant="soft" size="sm" disabled={savingKeyword} onClick={addKeyword}>
                  {savingKeyword ? "Adding…" : "Add"}
                </ThreeDButton>
                <button
                  type="button"
                  onClick={() => setAddingKeyword(false)}
                  className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingKeyword(true)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
              >
                <Plus className="size-3" />
                Add keyword
              </button>
            )}
          </div>

          {mentions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
              <p className="font-medium text-neutral-900">No mentions found yet</p>
              <p className="mt-1 text-sm text-neutral-500">
                Click &ldquo;Scan now&rdquo; to search X/Twitter, Reddit, YouTube, and LinkedIn for your keywords.
              </p>
            </div>
          ) : visibleMentions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
              <p className="text-sm text-neutral-500">No mentions match the selected filters.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleMentions.map((mention) => {
                const account = mention.account_id ? (accountById.get(mention.account_id) ?? null) : null;
                const mentionAuthorKey = authorKeyOf(mention.platform, mention.author_handle);
                return (
                  <MentionCard
                    key={mention.id}
                    mention={mention}
                    onClick={() => openMentionPanel(mention.id)}
                    onToggleSaved={() => setSaveTargetId(mention.id)}
                    onUnsave={() =>
                      patchMention(mention.id, {
                        is_saved: false,
                        save_note: null,
                        saved_account_name: null,
                        saved_at: null,
                      })
                    }
                    onToggleFollowUp={() => patchMention(mention.id, { needs_follow_up: !mention.needs_follow_up })}
                    isFollowed={
                      account ? account.is_followed : mentionAuthorKey ? followedKeys.has(mentionAuthorKey) : null
                    }
                    onToggleFollow={() => mentionAuthorKey && toggleFollowAccount(mentionAuthorKey)}
                    isPinned={pinnedIds.has(mention.id)}
                    onTogglePin={() => togglePin(mention.id)}
                  />
                );
              })}
            </div>
          )}

          {cursor && (
            <div ref={sentinelRef} className="flex justify-center py-4">
              {loadingMore && <Loader2 className="size-4 animate-spin text-neutral-400" />}
            </div>
          )}
        </div>
      </div>

      <div className={`shrink-0 transition-[width] duration-300 ease-out ${rightPanelOpen ? "w-[420px]" : "w-0"}`}>
        <div className="flex h-full w-[420px] items-stretch py-3 pr-3">
          {selectedMention ? (
            <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-[0px_2px_10px_rgba(0,0,0,0.08)]">
              <MentionPanel
                mention={selectedMention}
                onClose={() => setSelectedMentionId(null)}
                onToggleSaved={() => setSaveTargetId(selectedMention.id)}
                onUnsave={() =>
                  patchMention(selectedMention.id, {
                    is_saved: false,
                    save_note: null,
                    saved_account_name: null,
                    saved_at: null,
                  })
                }
                onToggleFollowUp={() => patchMention(selectedMention.id, { needs_follow_up: !selectedMention.needs_follow_up })}
                isFollowed={
                  selectedMention.account_id
                    ? (accountById.get(selectedMention.account_id)?.is_followed ?? null)
                    : (authorKeyOf(selectedMention.platform, selectedMention.author_handle) &&
                        followedKeys.has(authorKeyOf(selectedMention.platform, selectedMention.author_handle)!)) ||
                      null
                }
                onToggleFollow={() => {
                  const key = authorKeyOf(selectedMention.platform, selectedMention.author_handle);
                  if (key) toggleFollowAccount(key);
                }}
              />
            </div>
          ) : aiOpen ? (
            <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-neutral-100 bg-white shadow-[0px_2px_10px_rgba(0,0,0,0.08)]">
              <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-neutral-500" />
                  <span className="text-sm font-semibold text-neutral-900">Ask AI</span>
                  {pinnedMentions.length > 0 && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                      {pinnedMentions.length} pinned
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setAiOpen(false)}
                  aria-label="Close"
                  className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <CopilotChat buildContext={buildAiContext} />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={toggleAiPanel}
        aria-label={aiOpen ? "Close AI assistant" : "Open AI assistant"}
        className={`absolute top-6 z-20 flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold shadow-md transition-[right,background-color,color] ${
          rightPanelOpen ? "right-[27.75rem]" : "right-4"
        } ${aiOpen ? "bg-neutral-900 text-white" : "bg-white text-neutral-700 hover:bg-neutral-50"}`}
      >
        <Sparkles className="size-4" />
        <span>Ask AI</span>
      </button>

      {saveTargetId && mentions.find((m) => m.id === saveTargetId) && (
        <SaveLeadModal
          mention={mentions.find((m) => m.id === saveTargetId)!}
          onClose={() => setSaveTargetId(null)}
          onSave={(input) => saveLead(saveTargetId, input)}
        />
      )}
    </div>
  );
}
