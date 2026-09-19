"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import type { MarketPlatform } from "@/lib/market/types";

const PLATFORM_DOMAIN: Record<MarketPlatform, string> = {
  twitter: "x.com",
  reddit: "reddit.com",
  youtube: "youtube.com",
  linkedin: "linkedin.com",
};

export const PLATFORM_LABEL: Record<MarketPlatform, string> = {
  twitter: "X / Twitter",
  reddit: "Reddit",
  youtube: "YouTube",
  linkedin: "LinkedIn",
};

export function PlatformIcon({ platform, className = "size-3.5" }: { platform: MarketPlatform; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Globe className={`${className} text-neutral-400`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?sz=32&domain=${PLATFORM_DOMAIN[platform]}`}
      alt=""
      className={`${className} rounded-sm`}
      onError={() => setFailed(true)}
    />
  );
}

export function PlatformBadge({ platform }: { platform: MarketPlatform }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
      <PlatformIcon platform={platform} className="size-3" />
      {PLATFORM_LABEL[platform]}
    </span>
  );
}

/** Small badge that overlaps the bottom-right corner of an author avatar. */
export function PlatformCorner({ platform }: { platform: MarketPlatform }) {
  return (
    <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-black ring-2 ring-white">
      <PlatformIcon platform={platform} className="size-2.5 rounded-none" />
    </span>
  );
}
