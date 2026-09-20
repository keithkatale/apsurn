"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";

/**
 * A poster's profile picture, falling back to a stable generated avatar.
 *
 * Reddit gates profile photos behind authentication — its `about.json`
 * answers 403 to unauthenticated clients, and the keyless avatar proxies now
 * paywall Reddit — so for most mentions there is no honest way to show a real
 * picture. An avatar derived from the name is consistent across every post by
 * the same person, which reads as an identity in a feed the way a row of
 * identical grey placeholders does not.
 */

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-teal-500",
];

function avatarSeed(name: string): { initials: string; color: string } {
  // Strip the platform prefix so "u/alex" and "@alex" resolve identically.
  const cleaned = name.replace(/^@/, "").replace(/^[ur]\//i, "").trim();
  const initials = (cleaned.match(/[A-Za-z0-9]/g) ?? []).slice(0, 2).join("").toUpperCase() || "?";
  let hash = 0;
  for (let i = 0; i < cleaned.length; i++) hash = (hash * 31 + cleaned.charCodeAt(i)) >>> 0;
  return { initials, color: AVATAR_COLORS[hash % AVATAR_COLORS.length] };
}

export function AuthorAvatar({
  url,
  name,
  className = "size-9",
}: {
  url: string | null;
  name?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={`${className} shrink-0 rounded-full object-cover`}
        onError={() => setFailed(true)}
      />
    );
  }

  if (name) {
    const { initials, color } = avatarSeed(name);
    return (
      <span
        className={`${className} inline-flex shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${color}`}
      >
        {initials}
      </span>
    );
  }

  return (
    <span className={`${className} inline-flex shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400`}>
      <UserRound className="size-4" />
    </span>
  );
}
