"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Flag,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Repeat2,
  UserCheck,
  UserPlus,
  UserRound,
} from "lucide-react";
import { PlatformCorner } from "./PlatformBadge";
import type { MarketMentionWithKeyword } from "./types";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  // Pinned locale and time zone: bare toLocaleDateString() formats with the
  // server's locale during SSR and the browser's on hydration ("02/03/2026"
  // vs "3/2/2026"), which React reports as a hydration mismatch and repairs
  // by throwing away and re-rendering the tree.
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatCount(n: number | undefined): string {
  if (n == null) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function highlightKeyword(text: string, keyword: string | null | undefined): ReactNode {
  if (!keyword) return text;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === keyword.toLowerCase() ? (
      <mark key={i} className="rounded bg-violet-100 px-0.5 text-violet-900">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function Avatar({ url, platform, className = "size-9" }: { url: string | null; platform: MarketMentionWithKeyword["platform"]; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`relative inline-flex ${className} shrink-0`}>
      {!url || failed ? (
        <span className="flex size-full items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
          <UserRound className="size-4" />
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full rounded-full object-cover" onError={() => setFailed(true)} />
      )}
      <PlatformCorner platform={platform} />
    </span>
  );
}

export function MentionCard({
  mention,
  onClick,
  onToggleSaved,
  onToggleFollowUp,
  onUnsave,
  isFollowed,
  onToggleFollow,
  isPinned,
  onTogglePin,
}: {
  mention: MarketMentionWithKeyword;
  onClick: () => void;
  onToggleSaved: () => void;
  onUnsave?: () => void;
  onToggleFollowUp: () => void;
  isFollowed: boolean | null;
  onToggleFollow: () => void;
  isPinned: boolean;
  onTogglePin: () => void;
}) {
  const { engagement } = mention;
  const [mediaFailed, setMediaFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  function openMenu() {
    const rect = menuButtonRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 208) });
    setMenuOpen(true);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menuOpen]);

  function copyLink() {
    navigator.clipboard?.writeText(mention.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    // No overflow-hidden here — the dropdown menu needs to be able to spill
    // past the card's own bounds (e.g. on short cards) without being clipped.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onClick()}
      className="relative flex w-full cursor-pointer flex-col gap-2 rounded-2xl border border-neutral-100 bg-white p-4 text-left shadow-[0px_1px_3px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0px_2px_8px_rgba(0,0,0,0.08)]"
    >
      <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          aria-label={isPinned ? "Unpin from AI chat" : "Pin to AI chat"}
          title={isPinned ? "Unpin from AI chat" : "Pin to AI chat"}
          className={`rounded-full p-1 ${isPinned ? "text-blue-700" : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"}`}
        >
          <Pin className={`size-4 ${isPinned ? "fill-blue-700" : ""}`} />
        </button>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (menuOpen) setMenuOpen(false);
            else openMenu();
          }}
          aria-label="Post actions"
          className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>

      {menuOpen && menuPos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ top: menuPos.top, left: menuPos.left }}
            className="fixed z-50 flex w-52 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white py-1 shadow-lg"
          >
            <a
              href={mention.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            >
              <ExternalLink className="size-3.5" />
              Open
            </a>
            <button
              type="button"
              onClick={copyLink}
              className="flex items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            >
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </button>
            <div className="my-1 border-t border-neutral-100" />
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onToggleSaved();
              }}
              className="flex items-center justify-between px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            >
              <span className="flex items-center gap-2">
                <Bookmark className="size-3.5" />
                {mention.is_saved ? "Edit saved lead" : "Save lead"}
              </span>
              {mention.is_saved && <Check className="size-3.5 text-blue-700" />}
            </button>
            {mention.is_saved && onUnsave && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onUnsave();
                }}
                className="flex items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Unsave
              </button>
            )}
            <button
              type="button"
              onClick={onToggleFollowUp}
              className="flex items-center justify-between px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            >
              <span className="flex items-center gap-2">
                <Flag className="size-3.5" />
                Needs follow-up
              </span>
              {mention.needs_follow_up && <Check className="size-3.5 text-amber-700" />}
            </button>
            {isFollowed !== null && (
              <button
                type="button"
                onClick={onToggleFollow}
                className="flex items-center justify-between px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <span className="flex items-center gap-2">
                  {isFollowed ? <UserCheck className="size-3.5" /> : <UserPlus className="size-3.5" />}
                  Follow account
                </span>
                {isFollowed && <Check className="size-3.5 text-emerald-700" />}
              </button>
            )}
          </div>
        </>,
        document.body
      )}

      <div className="flex items-center gap-2.5 pr-14">
        <Avatar url={mention.author_avatar_url} platform={mention.platform} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <span className="truncate text-sm font-semibold text-neutral-900">
              {mention.author_name || mention.author_handle || "Unknown author"}
            </span>
            {mention.posted_at && <span className="shrink-0 text-xs text-neutral-400">· {timeAgo(mention.posted_at)}</span>}
          </div>
          {mention.author_handle && <p className="truncate text-xs text-neutral-400">{mention.author_handle}</p>}
        </div>
      </div>

      <p className="whitespace-pre-wrap text-sm text-neutral-800">
        {highlightKeyword(mention.content, mention.market_keywords?.keyword)}
      </p>

      {mention.media_url && !mediaFailed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mention.media_url}
          alt=""
          className="max-h-64 w-full rounded-lg object-cover"
          onError={() => setMediaFailed(true)}
        />
      )}

      <div className="flex items-center gap-4 pt-1 text-xs text-neutral-400">
        <span className="inline-flex items-center gap-1.5">
          <Heart className="size-4" />
          {formatCount(engagement.likes)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MessageCircle className="size-4" />
          {formatCount(engagement.comments)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Repeat2 className="size-4" />
          {formatCount(engagement.shares)}
        </span>
        {mention.market_keywords && (
          <span className="ml-auto rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">{mention.market_keywords.keyword}</span>
        )}
      </div>

      {mention.is_saved && (mention.save_note || mention.saved_account_name) && (
        <div className="rounded-lg bg-blue-50/70 px-3 py-2 text-xs text-blue-900">
          {mention.saved_account_name && (
            <p className="font-medium">{mention.saved_account_name}</p>
          )}
          {mention.save_note && <p className="mt-0.5 text-blue-800">{mention.save_note}</p>}
        </div>
      )}
    </div>
  );
}
