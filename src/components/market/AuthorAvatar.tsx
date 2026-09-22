"use client";

import { useEffect, useMemo, useState } from "react";
import { dicebearFaceUrl } from "@/lib/avatars/dicebear";
import { cn } from "@/lib/cn";

function avatarSeed(name?: string | null): string {
  return name?.replace(/^@/, "").replace(/^[ur]\//i, "").trim() || "profile";
}

function looksLikePlaceholder(src: string): boolean {
  return /unavatar\.io\/(fallback|static)|ghosts?\.gif|default[-_](profile|avatar)|d=identicon|styles\/.*\/default/i.test(src);
}

/**
 * Profile photo when it loads; otherwise a stable DiceBear face seeded from
 * the handle or name so the same person looks the same across every mention.
 */
export function AuthorAvatar({
  url,
  name,
  className = "size-9",
}: {
  url: string | null | undefined;
  name?: string | null;
  className?: string;
}) {
  const fallbackSrc = useMemo(() => dicebearFaceUrl(avatarSeed(name)), [name]);
  const [photoReady, setPhotoReady] = useState(false);

  useEffect(() => {
    setPhotoReady(false);
  }, [url]);

  return (
    <span className={cn("relative inline-flex shrink-0 overflow-hidden rounded-full bg-[#E8F1FC]", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={fallbackSrc} alt="" className="size-full object-cover" />
      {url ? (
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
          onError={() => setPhotoReady(false)}
          onLoad={(event) => {
            const loaded = event.currentTarget.currentSrc || event.currentTarget.src;
            if (looksLikePlaceholder(loaded)) return;
            setPhotoReady(true);
          }}
        />
      ) : null}
    </span>
  );
}
