"use client";

import { useState, type ReactNode } from "react";
import { Bookmark, ExternalLink, Flag, Heart, MessageCircle, Repeat2, Eye, UserCheck, UserPlus, UserRound, X } from "lucide-react";
import { PlatformBadge, PlatformIcon } from "./PlatformBadge";
import type { MarketMentionWithKeyword } from "./types";

function formatCount(n: number | undefined): string | null {
  if (n == null) return null;
  return n.toLocaleString();
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

function Avatar({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <UserRound className="size-4" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="size-9 shrink-0 rounded-full object-cover" onError={() => setFailed(true)} />
  );
}

export function MentionPanel({
  mention,
  onClose,
  onToggleSaved,
  onUnsave,
  onToggleFollowUp,
  isFollowed,
  onToggleFollow,
}: {
  mention: MarketMentionWithKeyword;
  onClose: () => void;
  onToggleSaved: () => void;
  onUnsave: () => void;
  onToggleFollowUp: () => void;
  isFollowed: boolean | null;
  onToggleFollow: () => void;
}) {
  const { engagement, comments } = mention;
  const [mediaFailed, setMediaFailed] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-3 pr-10">
        <div className="flex items-center gap-2">
          <PlatformIcon platform={mention.platform} className="size-4" />
          <h2 className="text-sm font-semibold text-neutral-900">Post details</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Avatar url={mention.author_avatar_url} />
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {mention.author_name || mention.author_handle || "Unknown author"}
                </p>
                {mention.author_handle && (
                  <p className="text-xs text-neutral-500">{mention.author_handle}</p>
                )}
              </div>
            </div>
            <PlatformBadge platform={mention.platform} />
          </div>

          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
            {highlightKeyword(mention.content, mention.market_keywords?.keyword)}
          </p>

          {mention.media_url && !mediaFailed && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mention.media_url}
              alt=""
              className="w-full rounded-lg object-cover"
              onError={() => setMediaFailed(true)}
            />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleSaved}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                mention.is_saved ? "border-blue-200 bg-blue-50 text-blue-700" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              <Bookmark className={`size-3.5 ${mention.is_saved ? "fill-blue-700" : ""}`} />
              {mention.is_saved ? "Edit save" : "Save lead"}
            </button>
            <button
              type="button"
              onClick={onToggleFollowUp}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                mention.needs_follow_up ? "border-amber-200 bg-amber-50 text-amber-700" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              <Flag className={`size-3.5 ${mention.needs_follow_up ? "fill-amber-700" : ""}`} />
              {mention.needs_follow_up ? "Following up" : "Follow up"}
            </button>
            {isFollowed !== null && (
              <button
                type="button"
                onClick={onToggleFollow}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                  isFollowed ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {isFollowed ? <UserCheck className="size-3.5" /> : <UserPlus className="size-3.5" />}
                {isFollowed ? "Following" : "Follow account"}
              </button>
            )}
          </div>

          <a
            href={mention.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline"
          >
            View original post
            <ExternalLink className="size-3" />
          </a>

          {mention.is_saved && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-950">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Saved lead</p>
              <p className="mt-1 font-medium">{mention.saved_account_name || mention.author_name || mention.author_handle}</p>
              {mention.save_note && <p className="mt-1 text-sm text-blue-900">{mention.save_note}</p>}
              <button type="button" onClick={onUnsave} className="mt-2 text-xs font-medium text-blue-700 underline">
                Unsave
              </button>
            </div>
          )}

          <div className="flex items-center gap-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            {formatCount(engagement.likes) && (
              <span className="inline-flex items-center gap-1">
                <Heart className="size-3.5" />
                {formatCount(engagement.likes)}
              </span>
            )}
            {formatCount(engagement.comments) && (
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="size-3.5" />
                {formatCount(engagement.comments)}
              </span>
            )}
            {formatCount(engagement.shares) && (
              <span className="inline-flex items-center gap-1">
                <Repeat2 className="size-3.5" />
                {formatCount(engagement.shares)}
              </span>
            )}
            {formatCount(engagement.views) && (
              <span className="inline-flex items-center gap-1">
                <Eye className="size-3.5" />
                {formatCount(engagement.views)}
              </span>
            )}
            {Object.keys(engagement).length === 0 && <span className="text-neutral-400">No engagement data found</span>}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Comments {comments.length > 0 ? `(${comments.length})` : ""}
            </h3>
            {comments.length === 0 ? (
              <p className="text-xs text-neutral-400">No comments found.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {comments.map((c, i) => (
                  <div key={i} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm">
                    {c.author && <p className="text-xs font-medium text-neutral-700">{c.author}</p>}
                    <p className="text-neutral-600">{c.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {mention.market_keywords && (
            <p className="text-xs font-medium text-blue-700">Matched keyword: {mention.market_keywords.keyword}</p>
          )}
        </div>
      </div>
    </div>
  );
}
