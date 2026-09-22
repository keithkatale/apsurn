"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

function linkedinHandle(url: string): string | null {
  const match = url.trim().match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).replace(/\/+$/, "");
  } catch {
    return match[1].replace(/\/+$/, "");
  }
}

function emailOf(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function initialsOf(name?: string | null, email?: string | null): string {
  // Strip emoji / symbols first — indexing into a ZWJ emoji (e.g. 🏄‍♂️) yields
  // lone surrogates that hydrate differently on server vs client.
  const cleaned = (name ?? "")
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Component}|\uFE0F|\u200D/gu, " ")
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  if (parts.length === 1 && parts[0].length > 0) {
    const letters = [...parts[0]].filter((ch) => /\p{L}|\p{N}/u.test(ch));
    if (letters.length >= 2) return `${letters[0]}${letters[1]}`.toUpperCase();
    if (letters.length === 1) return letters[0].toUpperCase();
  }
  const local = emailOf(email)?.split("@")[0];
  if (local) {
    const letters = [...local].filter((ch) => /[a-z0-9]/i.test(ch));
    if (letters.length >= 2) return `${letters[0]}${letters[1]}`.toUpperCase();
    if (letters.length === 1) return letters[0].toUpperCase();
  }
  return "?";
}

/** Real profile photo URLs only — LinkedIn / email / Gravatar via unavatar. */
export function contactPhotoSources(linkedinUrl?: string | null, email?: string | null): string[] {
  const sources: string[] = [];
  const handle = linkedinUrl ? linkedinHandle(linkedinUrl) : null;
  if (handle) {
    sources.push(`https://unavatar.io/linkedin/${encodeURIComponent(handle)}?fallback=false`);
  }
  const address = emailOf(email);
  if (address) {
    sources.push(`https://unavatar.io/${encodeURIComponent(address)}?fallback=false`);
    sources.push(`https://unavatar.io/gravatar/${encodeURIComponent(address)}?fallback=false`);
  }
  return [...new Set(sources)];
}

function looksLikePlaceholder(src: string): boolean {
  return /unavatar\.io\/(fallback|static)|ghosts?\.gif|default[-_](profile|avatar)|d=identicon|dicebear/i.test(src);
}

export function ContactAvatar({
  name,
  linkedinUrl,
  email,
  className = "size-9",
}: {
  name: string | null | undefined;
  linkedinUrl?: string | null;
  email?: string | null;
  className?: string;
}) {
  const sources = useMemo(() => contactPhotoSources(linkedinUrl, email), [linkedinUrl, email]);
  const initials = useMemo(() => initialsOf(name, email), [name, email]);
  // Defer <img> until after mount so SSR HTML always matches the first client paint.
  const [mounted, setMounted] = useState(false);
  const [index, setIndex] = useState(0);
  const [photoReady, setPhotoReady] = useState(false);
  const src = sources[index] ?? null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setIndex(0);
    setPhotoReady(false);
  }, [linkedinUrl, email]);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-[11px] font-semibold tracking-wide text-neutral-500",
        className,
      )}
      aria-hidden={photoReady}
    >
      <span className={cn(photoReady && "opacity-0")}>{initials}</span>
      {mounted && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className={cn(
            "absolute inset-0 size-full object-cover",
            photoReady ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onError={() => {
            setPhotoReady(false);
            setIndex((current) => current + 1);
          }}
          onLoad={(event) => {
            const loaded = event.currentTarget.currentSrc || event.currentTarget.src;
            if (looksLikePlaceholder(loaded)) {
              setPhotoReady(false);
              setIndex((current) => current + 1);
              return;
            }
            setPhotoReady(true);
          }}
        />
      ) : null}
    </span>
  );
}
