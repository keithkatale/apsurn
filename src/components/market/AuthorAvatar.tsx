"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

function initialsOf(name?: string | null): string {
  const cleaned = (name ?? "")
    .replace(/^@/, "")
    .replace(/^[ur]\//i, "")
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Component}|\uFE0F|\u200D/gu, " ")
    .replace(/[^\p{L}\p{N}\s_./'-]/gu, " ")
    .replace(/[\s_./-]+/g, " ")
    .trim();
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length >= 2) {
    const a = [...parts[0]].find((ch) => /\p{L}|\p{N}/u.test(ch));
    const b = [...parts[1]].find((ch) => /\p{L}|\p{N}/u.test(ch));
    if (a && b) return `${a}${b}`.toUpperCase();
  }
  if (parts.length >= 1) {
    const letters = [...parts[0]].filter((ch) => /\p{L}|\p{N}/u.test(ch));
    if (letters.length >= 2) return `${letters[0]}${letters[1]}`.toUpperCase();
    if (letters.length === 1) return letters[0].toUpperCase();
  }
  return "?";
}

function looksLikePlaceholder(src: string): boolean {
  return /unavatar\.io\/(fallback|static)|ghosts?\.gif|default[-_](profile|avatar)|d=identicon|dicebear|styles\/.*\/default/i.test(
    src,
  );
}

/** Real profile photo when available; otherwise initials — no generated avatars. */
export function AuthorAvatar({
  url,
  name,
  className = "size-9",
}: {
  url: string | null | undefined;
  name?: string | null;
  className?: string;
}) {
  const initials = useMemo(() => initialsOf(name), [name]);
  const [mounted, setMounted] = useState(false);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const photoReady = Boolean(url && loadedUrl === url);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLoadedUrl(null);
  }, [url]);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-[11px] font-semibold tracking-wide text-neutral-500",
        className,
      )}
      aria-hidden={photoReady}
    >
      <span className={cn(photoReady && "opacity-0")}>{initials}</span>
      {mounted && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={url}
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          className={cn(
            "absolute inset-0 size-full object-cover",
            photoReady ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onError={() => setLoadedUrl(null)}
          onLoad={(event) => {
            const loaded = event.currentTarget.currentSrc || event.currentTarget.src;
            if (looksLikePlaceholder(loaded)) {
              setLoadedUrl(null);
              return;
            }
            setLoadedUrl(url);
          }}
        />
      ) : null}
    </span>
  );
}
