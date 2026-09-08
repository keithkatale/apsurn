"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Globe, Plus } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import type { AnalyticsSite } from "@/lib/analytics/types";
import { landingCard } from "./styles";

export function SiteSelector({
  selectedSiteId,
  onSiteChange,
}: {
  selectedSiteId: string | null;
  onSiteChange: (siteId: string) => void;
}) {
  const [sites, setSites] = useState<AnalyticsSite[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/analytics/sites")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? (data as AnalyticsSite[]) : [];
        setSites(list);
      })
      .catch(() => setSites([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = sites.find((site) => site.site_id === selectedSiteId);

  if (loading) return <p className="text-sm text-neutral-500">Loading sites…</p>;

  return (
    <div className="relative shrink-0" ref={dropdownRef}>
      <ThreeDButton
        type="button"
        variant="soft"
        className="min-w-[200px] justify-start rounded-xl px-3"
        onClick={() => setOpen((value) => !value)}
      >
        <Globe className="size-4 text-neutral-500" />
        <span className="flex-1 truncate text-left">{selected?.domain ?? "Select site"}</span>
        <ChevronDown className="size-4 text-neutral-400" />
      </ThreeDButton>
      {open && (
        <div className={`absolute z-20 mt-2 w-full min-w-[200px] overflow-hidden ${landingCard}`}>
          {sites.map((site) => (
            <button
              key={site.id}
              type="button"
              onClick={() => {
                onSiteChange(site.site_id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                site.site_id === selectedSiteId
                  ? "bg-neutral-100 font-medium text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              <Globe className="size-3.5" />
              {site.domain}
            </button>
          ))}
          <div className="border-t border-neutral-100" />
          <a
            href="#sites"
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
          >
            <Plus className="size-3.5" />
            Add site
          </a>
        </div>
      )}
    </div>
  );
}
