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
    `https://www.google.com/s2/favicons?sz=64&domain=${encoded}`,
    `https://icons.duckduckgo.com/ip3/${encoded}.ico`,
  ];
}

export function CompanyFavicon({
  domain,
  name,
  className = "size-5",
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
        className={`inline-flex shrink-0 items-center justify-center rounded bg-neutral-100 text-[10px] font-semibold text-neutral-500 ${className}`}
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
      className={`shrink-0 rounded-sm object-contain ${className}`}
      onError={() => setSourceIndex((i) => i + 1)}
    />
  );
}
