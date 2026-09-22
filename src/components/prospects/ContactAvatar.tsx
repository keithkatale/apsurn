"use client";

import { useEffect, useMemo, useState } from "react";
import { dicebearFaceUrl } from "@/lib/avatars/dicebear";
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

function avatarSeed(name?: string | null, email?: string | null, linkedinUrl?: string | null): string {
  return emailOf(email) || name?.trim() || (linkedinUrl ? linkedinHandle(linkedinUrl) : null) || "lead";
}

/** Photo URLs to try. Never shown unless onLoad succeeds. */
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
  return /unavatar\.io\/(fallback|static)|ghosts?\.gif|default[-_](profile|avatar)|d=identicon/i.test(src);
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
  const seed = useMemo(() => avatarSeed(name, email, linkedinUrl), [name, email, linkedinUrl]);
  const fallbackSrc = useMemo(() => dicebearFaceUrl(seed), [seed]);
  const sources = useMemo(() => contactPhotoSources(linkedinUrl, email), [linkedinUrl, email]);
  const [index, setIndex] = useState(0);
  const [photoReady, setPhotoReady] = useState(false);
  const src = sources[index];

  useEffect(() => {
    setIndex(0);
    setPhotoReady(false);
  }, [linkedinUrl, email]);

  useEffect(() => {
    setPhotoReady(false);
  }, [src]);

  return (
    <span className={cn("relative inline-flex shrink-0 overflow-hidden rounded-lg bg-[#E8F1FC]", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fallbackSrc} alt="" className="size-full object-cover" />
      {src ? (
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
          onError={() => setIndex((current) => current + 1)}
          onLoad={(event) => {
            const loaded = event.currentTarget.currentSrc || event.currentTarget.src;
            if (looksLikePlaceholder(loaded)) {
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
