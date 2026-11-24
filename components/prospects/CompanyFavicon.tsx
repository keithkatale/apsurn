"use client";

import { useState } from "react";

function hostOf(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .toLowerCase();
}

function faviconSources(host: string): string[] {
  const encoded = encodeURIComponent(host);
  return [
    `https://www.google.com/s2/favicons?sz=128&domain=${encoded}`,
    `https://icons.duckduckgo.com/ip3/${encoded}.ico`,
    `https://unavatar.io/${encoded}?fallback=false`,
  ];
}

export function CompanyFavicon({
  domain,
  name,
  className = "size-8",
}: {
  domain: string;
  name?: string;
  className?: string;
}) {
  const host = hostOf(domain);
  const sources = host ? faviconSources(host) : [];
  const [sourceIndex, setSourceIndex] = useState(0);
  const letter = (name || host || "?").trim().charAt(0).toUpperCase();

  if (!host || sourceIndex >= sources.length) {
    return (
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center rounded-[8px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] text-xs font-semibold text-[var(--mh-fg)] select-none ${className}`}
      >
        {letter}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sources[sourceIndex]}
      alt=""
      className={`shrink-0 rounded-[8px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)] object-contain p-1 ${className}`}
      onError={() => setSourceIndex((i) => i + 1)}
    />
  );
}
