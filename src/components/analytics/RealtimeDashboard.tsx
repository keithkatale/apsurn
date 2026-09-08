"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { RealtimeSection } from "@/components/analytics/RealtimeSection";
import type { AnalyticsSite, LiveVisitor } from "@/lib/analytics/types";

export function RealtimeDashboard() {
  const searchParams = useSearchParams();
  const siteIdFromUrl = searchParams.get("siteId");
  const [sites, setSites] = useState<AnalyticsSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(siteIdFromUrl);
  const [visitors, setVisitors] = useState<LiveVisitor[]>([]);
  const [autoRotate, setAutoRotate] = useState(true);
  const [loading, setLoading] = useState(true);

  const loadLive = useCallback((siteId: string) => {
    fetch(`/api/analytics/live?siteId=${encodeURIComponent(siteId)}`)
      .then((res) => res.json())
      .then((data) => {
        setVisitors(Array.isArray(data.visitors) ? data.visitors : []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/analytics/sites")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? (data as AnalyticsSite[]) : [];
        setSites(list);
        setSelectedSiteId((current) => current ?? list[0]?.site_id ?? null);
      })
      .catch(() => setSites([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedSiteId) return;
    loadLive(selectedSiteId);
    const interval = setInterval(() => loadLive(selectedSiteId), 5000);
    return () => clearInterval(interval);
  }, [selectedSiteId, loadLive]);

  const selectedSite = sites.find((site) => site.site_id === selectedSiteId);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!selectedSiteId) {
    return <p className="text-sm text-neutral-500">Add a site on the analytics page to see live visitors.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-neutral-900">Realtime</h1>
        <p className="text-neutral-600">Live visitors on {selectedSite?.domain ?? "your site"}.</p>
      </header>
      <RealtimeSection
        visitors={visitors}
        domain={selectedSite?.domain ?? null}
        autoRotate={autoRotate}
        onToggleRotate={() => setAutoRotate((value) => !value)}
        onRefresh={() => loadLive(selectedSiteId)}
        fullPage
      />
    </div>
  );
}
