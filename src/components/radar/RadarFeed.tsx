"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Globe, Sparkles } from "lucide-react";
import type { MarketPlatform, RadarFeedPayload, RadarIntent, RadarMentionCard } from "@/lib/market/types";

export function RedditIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#FF4500" />
      <path
        fill="#FFFFFF"
        d="M19.2 12c0-.7-.6-1.3-1.3-1.3-.4 0-.7.2-.9.5-1-.7-2.4-1.2-4-1.2l.7-3.3 2.3.5c0 .6.5 1 1.1 1 .6 0 1.1-.5 1.1-1.1s-.5-1.1-1.1-1.1c-.5 0-.9.3-1 .8l-2.6-.6c-.2 0-.3.1-.4.3l-.8 3.8c-1.7 0-3.1.5-4.1 1.2-.2-.3-.6-.5-1-.5-.7 0-1.3.6-1.3 1.3 0 .5.3.9.7 1.1-.1.3-.1.6-.1.9 0 2.4 2.8 4.3 6.3 4.3s6.3-1.9 6.3-4.3c0-.3 0-.6-.1-.9.4-.2.7-.6.7-1.1zm-10.1.8c.5 0 .9.4.9.9s-.4.9-.9.9-.9-.4-.9-.9.4-.9.9-.9zm5.8 3.5c-.7.7-2.1.8-2.9.8s-2.1-.1-2.9-.8c-.1-.1-.1-.3 0-.4.1-.1.3-.1.4 0 .5.5 1.6.6 2.5.6s2-.1 2.5-.6c.1-.1.3-.1.4 0 .1.1.1.3 0 .4zm-.1-2.6c-.5 0-.9-.4-.9-.9s.4-.9.9-.9.9.4.9.9-.4.9-.9.9z"
      />
    </svg>
  );
}

export function XTwitterIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function LinkedInIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#0A66C2"
        d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"
      />
    </svg>
  );
}

export function HackerNewsIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#FF6600" />
      <path fill="#FFFFFF" d="M12.95 13.1v4.4h-1.9v-4.4L7.5 6.5h2.1l2.4 4.8 2.4-4.8h2.1z" />
    </svg>
  );
}

export function YouTubeIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#FF0000"
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"
      />
      <path fill="#FFFFFF" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function PlatformIcon({
  platform,
  className = "size-3.5",
}: {
  platform: string;
  className?: string;
}) {
  const p = platform.toLowerCase();
  if (p === "reddit" || p.includes("reddit")) return <RedditIcon className={className} />;
  if (p === "twitter" || p === "x" || p.includes("twitter") || p.includes("x.com")) return <XTwitterIcon className={className} />;
  if (p === "linkedin" || p.includes("linkedin")) return <LinkedInIcon className={className} />;
  if (p === "hackernews" || p === "hn" || p.includes("hacker") || p.includes("ycombinator")) return <HackerNewsIcon className={className} />;
  if (p === "youtube" || p.includes("youtube")) return <YouTubeIcon className={className} />;
  return <Globe className={className} aria-hidden="true" />;
}

function HighlightedText({ text, keywords }: { text: string; keywords: string[] }) {
  if (!text) return null;
  const validKeywords = Array.from(
    new Set(
      keywords
        .map((k) => k.trim())
        .filter((k) => k.length >= 2),
    ),
  ).sort((a, b) => b.length - a.length);

  if (validKeywords.length === 0) {
    return <>{text}</>;
  }

  const escaped = validKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  const lowerSet = new Set(validKeywords.map((k) => k.toLowerCase()));

  return (
    <>
      {parts.map((part, index) => {
        if (lowerSet.has(part.toLowerCase())) {
          return (
            <mark
              key={index}
              className="rounded-xs bg-amber-400/25 px-1 py-0.5 font-medium text-amber-950 dark:bg-amber-400/20 dark:text-amber-200"
            >
              {part}
            </mark>
          );
        }
        return part;
      })}
    </>
  );
}

const PLATFORMS: Array<{ id: "all" | MarketPlatform; label: string }> = [
  { id: "all", label: "All" },
  { id: "reddit", label: "Reddit" },
  { id: "twitter", label: "X" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "hackernews", label: "Hacker News" },
];

const INTENTS: Array<{ id: "all" | RadarIntent; label: string }> = [
  { id: "all", label: "Any intent" },
  { id: "tool_recommendation", label: "Asking for a tool" },
  { id: "competitor_churn", label: "Switching" },
  { id: "workflow_pain", label: "Pain" },
  { id: "hiring_growth", label: "Hiring" },
];

const PLATFORM_LABEL: Record<string, string> = {
  reddit: "Reddit",
  twitter: "X",
  linkedin: "LinkedIn",
  hackernews: "Hacker News",
  youtube: "YouTube",
};

function when(iso: string | null): string {
  if (!iso) return "just now";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "just now";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function excerpt(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

export function RadarFeed({ initial }: { initial: RadarFeedPayload }) {
  const [feed, setFeed] = useState(initial);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]["id"]>("all");
  const [intent, setIntent] = useState<(typeof INTENTS)[number]["id"]>("all");
  const [phrase, setPhrase] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh(): Promise<RadarFeedPayload | null> {
    const res = await fetch("/api/radar/feed");
    if (!res.ok) return null;
    const body = (await res.json()) as { feed?: RadarFeedPayload };
    if (!body.feed) return null;
    setFeed(body.feed);
    return body.feed;
  }

  useEffect(() => {
    if (initial.schemaError || initial.fresh || initial.keywords.filter((keyword) => keyword.isActive).length === 0) return;
    let cancelled = false;
    const poll = window.setInterval(() => {
      if (!cancelled) void refresh();
    }, 3000);
    setScanning(true);
    void (async () => {
      try {
        await fetch("/api/radar/scan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ depth: "broad" }),
        });
        if (!cancelled) await refresh();
      } finally {
        window.clearInterval(poll);
        if (!cancelled) setScanning(false);
      }
    })();
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
    // The first paint decides whether a shallow scan is due. Later refreshes should not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(
    () =>
      feed.mentions.filter((mention) => {
        if (platform !== "all" && mention.platform !== platform) return false;
        if (intent !== "all" && mention.intent !== intent) return false;
        return true;
      }),
    [feed.mentions, platform, intent],
  );

  async function scanDeeper() {
    setScanning(true);
    setNotice(null);
    const poll = window.setInterval(() => void refresh(), 3000);
    try {
      const res = await fetch("/api/radar/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ depth: "deep" }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 402) setNotice(body.error ?? "Not enough credits to scan deeper.");
      else if (!res.ok) setNotice(body.error ?? "Scan failed.");
      await refresh();
    } finally {
      window.clearInterval(poll);
      setScanning(false);
    }
  }

  async function toggleKeyword(id: string, isActive: boolean) {
    setFeed((current) => ({
      ...current,
      keywords: current.keywords.map((keyword) => (keyword.id === id ? { ...keyword, isActive } : keyword)),
    }));
    const res = await fetch("/api/radar/keywords", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, isActive }),
    });
    if (!res.ok) await refresh();
  }

  async function addKeyword(event: FormEvent) {
    event.preventDefault();
    const keyword = phrase.trim();
    if (keyword.length < 3) return;
    setPhrase("");
    const res = await fetch("/api/radar/keywords", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keyword }),
    });
    const body = (await res.json().catch(() => ({}))) as { feed?: RadarFeedPayload; error?: string };
    if (body.feed) setFeed(body.feed);
    else setNotice(body.error ?? "Could not add that phrase");
  }

  async function retune() {
    setNotice(null);
    const res = await fetch("/api/radar/keywords/refresh", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { feed?: RadarFeedPayload; added?: number; error?: string };
    if (!res.ok || !body.feed) {
      setNotice(body.error ?? "Could not retune phrases");
      return;
    }
    setFeed(body.feed);
    setNotice(body.added ? `Added ${body.added} phrase${body.added === 1 ? "" : "s"}` : "Phrases already cover what you dismissed");
  }

  async function copyOpener(mention: RadarMentionCard) {
    if (!mention.suggestedOpener) return;
    try {
      await navigator.clipboard.writeText(mention.suggestedOpener);
      setCopiedId(mention.id);
      window.setTimeout(() => setCopiedId((current) => (current === mention.id ? null : current)), 2000);
    } catch {
      setNotice("Could not copy the opener");
    }
  }

  async function dismiss(id: string) {
    setBusyId(id);
    setFeed((current) => ({
      ...current,
      mentions: current.mentions.filter((mention) => mention.id !== id),
      dismissedCount: current.dismissedCount + 1,
    }));
    const res = await fetch(`/api/radar/mentions/${id}/dismiss`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      setNotice("Could not dismiss that conversation");
      await refresh();
    }
  }

  async function save(id: string) {
    setBusyId(id);
    const res = await fetch(`/api/radar/mentions/${id}/save`, { method: "POST" });
    setBusyId(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setNotice(body.error ?? "Could not save that conversation");
      return;
    }
    setFeed((current) => ({ ...current, mentions: current.mentions.filter((mention) => mention.id !== id) }));
    setNotice("Saved to Prospects");
  }

  const activeKeywords = feed.keywords.filter((keyword) => keyword.isActive);
  const activeKeywordStrings = activeKeywords.map((k) => k.keyword);
  const caughtUp = !scanning && visible.length === 0 && feed.mentions.length === 0 && feed.dismissedCount > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-neutral-200 px-4 py-4 md:px-6 dark:border-neutral-800">
        <div className="mx-auto w-full max-w-2xl space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-heading text-2xl tracking-[-0.03em] text-neutral-900 dark:text-neutral-100">Radar</h1>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {scanning
                  ? "Searching Reddit, X, LinkedIn, and Hacker News…"
                  : feed.lastScannedAt
                    ? `Last checked ${when(feed.lastScannedAt)} · ${feed.mentions.length} conversation${feed.mentions.length === 1 ? "" : "s"}`
                    : "Listening for people who might buy"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void scanDeeper()}
              disabled={scanning || activeKeywords.length === 0}
              className="rounded-full bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
            >
              Scan deeper
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Listening for</p>
              <button type="button" onClick={() => void retune()} className="text-[11px] font-semibold text-neutral-900 hover:underline dark:text-neutral-100">
                Retune
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {feed.keywords.map((keyword) => (
                <button
                  key={keyword.id}
                  type="button"
                  aria-pressed={keyword.isActive}
                  onClick={() => void toggleKeyword(keyword.id, !keyword.isActive)}
                  className={
                    keyword.isActive
                      ? "rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-white dark:text-neutral-900"
                      : "rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-400 line-through dark:border-neutral-700"
                  }
                >
                  {keyword.keyword}
                </button>
              ))}
              <form onSubmit={(event) => void addKeyword(event)} className="flex items-center gap-1">
                <input
                  value={phrase}
                  onChange={(event) => setPhrase(event.target.value)}
                  placeholder="Add a phrase"
                  aria-label="Add a listening phrase"
                  className="h-7 w-36 rounded-full border border-neutral-200 bg-white px-3 text-xs text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
                <button type="submit" className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-900 dark:border-neutral-700 dark:text-neutral-100">
                  Add
                </button>
              </form>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {PLATFORMS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={platform === item.id}
                onClick={() => setPlatform(item.id)}
                className={
                  platform === item.id
                    ? "inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                    : "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                }
              >
                {item.id !== "all" ? <PlatformIcon platform={item.id} className="size-3 shrink-0" /> : null}
                <span>{item.label}</span>
              </button>
            ))}
            <span className="mx-1 h-3 w-px bg-neutral-200 dark:bg-neutral-800" aria-hidden="true" />
            {INTENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={intent === item.id}
                onClick={() => setIntent(item.id)}
                className={
                  intent === item.id
                    ? "rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
                    : "rounded-full px-2.5 py-1 text-[11px] font-medium text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                }
              >
                {item.label}
              </button>
            ))}
          </div>
          {notice ? <p className="text-xs text-neutral-600 dark:text-neutral-300">{notice}</p> : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
        <div className="mx-auto w-full max-w-2xl">
          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-200 bg-white px-6 py-10 text-center dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {feed.schemaError
                  ? "Radar is waiting on a database update"
                  : scanning
                    ? "Qualifying conversations…"
                    : feed.mentions.length > 0
                      ? "Nothing in this filter"
                      : caughtUp
                        ? "You're caught up"
                        : feed.keywords.length === 0
                          ? "No listening phrases yet"
                          : "Nothing qualified on the last pass"}
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
                {feed.schemaError
                  ? feed.schemaError
                  : scanning
                    ? "New cards show up here as they qualify."
                    : feed.mentions.length > 0
                      ? "Clear a platform or intent filter to see the other conversations."
                      : caughtUp
                        ? "Dismissed conversations stay hidden. New ones show up after the next scan."
                        : feed.keywords.length === 0
                          ? "Add a phrase a buyer would actually post, or finish your blueprint so Radar can choose them."
                          : "Add a phrase a buyer would post, or scan deeper."}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {visible.map((mention) => {
                const cardKeywords = [mention.keyword, ...activeKeywordStrings].filter((k): k is string => Boolean(k));

                return (
                  <li key={mention.id} className="rounded-xl border border-neutral-200 bg-white p-4.5 dark:border-neutral-800 dark:bg-[#121212]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200/80 bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-800 dark:border-neutral-700/80 dark:bg-neutral-800 dark:text-neutral-200">
                          <PlatformIcon platform={mention.platform} className="size-3.5 shrink-0" />
                          <span>{PLATFORM_LABEL[mention.platform] ?? mention.platform}</span>
                        </span>

                        {mention.keyword ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                            <Sparkles className="size-3 shrink-0" />
                            <span>{mention.keyword}</span>
                          </span>
                        ) : null}

                        {mention.qualifyScore != null ? (
                          <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500 dark:bg-neutral-800/80 dark:text-neutral-400">
                            Fit {mention.qualifyScore}
                          </span>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        aria-label="Dismiss conversation"
                        disabled={busyId === mention.id}
                        onClick={() => void dismiss(mention.id)}
                        className="shrink-0 text-xs font-medium text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                      >
                        Dismiss
                      </button>
                    </div>

                    <p className="mt-2.5 text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {mention.authorName || mention.authorHandle || "Someone"}
                      <span className="ml-2 font-normal text-neutral-400">{when(mention.postedAt)}</span>
                    </p>

                    <p className="mt-2.5 line-clamp-4 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                      <HighlightedText text={excerpt(mention.content)} keywords={cardKeywords} />
                    </p>

                    {mention.qualifyReason ? (
                      <p className="mt-2.5 text-sm text-neutral-600 dark:text-neutral-400">
                        <span className="font-medium text-neutral-800 dark:text-neutral-200">Why this qualifies. </span>
                        <HighlightedText text={mention.qualifyReason} keywords={cardKeywords} />
                      </p>
                    ) : null}

                    {mention.suggestedOpener ? (
                      <p className="mt-2.5 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                        {mention.suggestedOpener}
                      </p>
                    ) : null}

                    <div className="mt-3.5 flex flex-wrap gap-2">
                      <a
                        href={mention.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-900 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-900"
                      >
                        Open
                      </a>
                      <button
                        type="button"
                        onClick={() => void copyOpener(mention)}
                        disabled={!mention.suggestedOpener}
                        className="rounded-full border border-neutral-200 px-3 py-1 text-xs font-semibold text-neutral-900 hover:bg-neutral-50 disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-900"
                      >
                        {copiedId === mention.id ? "Copied" : "Copy opener"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void save(mention.id)}
                        disabled={busyId === mention.id}
                        className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                      >
                        Save
                      </button>
                      <Link href="/dashboard/prospects" className="self-center text-[11px] font-medium text-neutral-400 hover:underline">
                        Prospects
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
