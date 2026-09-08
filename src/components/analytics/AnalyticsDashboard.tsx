"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Globe, Loader2, Zap } from "lucide-react";
import { AnalyticsChart } from "@/components/analytics/AnalyticsChart";
import { BreakdownCard } from "@/components/analytics/BreakdownCard";
import { AddSiteForm, SitesSection } from "@/components/analytics/SitesSection";
import { landingCard } from "@/components/analytics/styles";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { trackingSnippet } from "@/lib/analytics/snippet";
import type {
  AnalyticsSite,
  AnalyticsStats,
  BreakdownItem,
  TimelinePoint,
} from "@/lib/analytics/types";

function asItems(json: unknown): BreakdownItem[] {
  if (!Array.isArray(json)) return [];
  return json.map((item: { name?: string; value?: number; count?: number; code?: string }) => ({
    name: item.name ?? "Unknown",
    value: item.count ?? item.value ?? 0,
    code: item.code,
  }));
}

export function AnalyticsDashboard() {
  const [sites, setSites] = useState<AnalyticsSite[]>([]);
  const [stats, setStats] = useState<AnalyticsStats>({
    visitors: 0,
    pageViews: 0,
    bounceRate: 0,
    avgSessionTime: 0,
  });
  const [visitorsNow, setVisitorsNow] = useState(0);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [pages, setPages] = useState<BreakdownItem[]>([]);
  const [hostnames, setHostnames] = useState<BreakdownItem[]>([]);
  const [entryPages, setEntryPages] = useState<BreakdownItem[]>([]);
  const [exitPages, setExitPages] = useState<BreakdownItem[]>([]);
  const [referrers, setReferrers] = useState<BreakdownItem[]>([]);
  const [countries, setCountries] = useState<BreakdownItem[]>([]);
  const [regions, setRegions] = useState<BreakdownItem[]>([]);
  const [cities, setCities] = useState<BreakdownItem[]>([]);
  const [devices, setDevices] = useState<BreakdownItem[]>([]);
  const [browsers, setBrowsers] = useState<BreakdownItem[]>([]);
  const [oses, setOses] = useState<BreakdownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSites, setLoadingSites] = useState(true);
  const [range, setRange] = useState("24h");
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [snippet, setSnippet] = useState<string | null>(null);

  const onSiteChange = useCallback((siteId: string) => {
    setSelectedSiteId(siteId);
  }, []);

  useEffect(() => {
    fetch("/api/analytics/sites")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? (data as AnalyticsSite[]) : [];
        setSites(list);
        if (list[0]) setSelectedSiteId(list[0].site_id);
      })
      .catch(() => setSites([]))
      .finally(() => setLoadingSites(false));
  }, []);

  useEffect(() => {
    if (!selectedSiteId) return;
    const query = `?range=${range}&siteId=${encodeURIComponent(selectedSiteId)}`;
    Promise.all([
      fetch(`/api/analytics/overview${query}`),
      fetch(`/api/analytics/timeline${query}`),
      fetch(`/api/analytics/pages${query}&type=page`),
      fetch(`/api/analytics/pages${query}&type=hostname`),
      fetch(`/api/analytics/pages${query}&type=entry_page`),
      fetch(`/api/analytics/pages${query}&type=exit_page`),
      fetch(`/api/analytics/referrers${query}&type=referrer`),
      fetch(`/api/analytics/locations${query}&type=country`),
      fetch(`/api/analytics/locations${query}&type=region`),
      fetch(`/api/analytics/locations${query}&type=city`),
      fetch(`/api/analytics/devices${query}&type=device`),
      fetch(`/api/analytics/devices${query}&type=browser`),
      fetch(`/api/analytics/devices${query}&type=os`),
    ])
      .then(async (responses) => {
        const json = await Promise.all(responses.map((res) => res.json()));
        const [
          overview,
          timelineData,
          pagesData,
          hostnameData,
          entryData,
          exitData,
          referrerData,
          countryData,
          regionData,
          cityData,
          deviceData,
          browserData,
          osData,
        ] = json;
        setStats(
          overview.error
            ? { visitors: 0, pageViews: 0, bounceRate: 0, avgSessionTime: 0 }
            : overview
        );
        setTimeline(Array.isArray(timelineData) ? timelineData : []);
        setPages(asItems(pagesData));
        setHostnames(asItems(hostnameData));
        setEntryPages(asItems(entryData));
        setExitPages(asItems(exitData));
        setReferrers(asItems(referrerData));
        setCountries(asItems(countryData));
        setRegions(asItems(regionData));
        setCities(asItems(cityData));
        setDevices(asItems(deviceData));
        setBrowsers(asItems(browserData));
        setOses(asItems(osData));
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [range, selectedSiteId]);

  useEffect(() => {
    if (!selectedSiteId) return;
    function loadLive(siteId: string) {
      fetch(`/api/analytics/live?siteId=${encodeURIComponent(siteId)}`)
        .then((res) => res.json())
        .then((data) => setVisitorsNow(data.visitorsNow ?? 0))
        .catch(() => undefined);
    }
    loadLive(selectedSiteId);
    const interval = setInterval(() => loadLive(selectedSiteId), 5000);
    return () => clearInterval(interval);
  }, [selectedSiteId]);

  const selectedSite = sites.find((site) => site.site_id === selectedSiteId);
  const hasData = stats.pageViews > 0 || timeline.some((point) => point.visitors > 0);

  function copySnippet() {
    if (!selectedSite) return;
    navigator.clipboard.writeText(trackingSnippet(window.location.origin, selectedSite.site_id));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSiteCreated(site: AnalyticsSite, trackingCode: string) {
    setSites((current) => [site, ...current]);
    setSelectedSiteId(site.site_id);
    setSnippet(trackingCode);
  }

  if (loadingSites) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (sites.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold text-neutral-900">Analytics</h1>
          <p className="text-neutral-600">
            Privacy-friendly website analytics — page views, referrers, locations, and live visitors.
          </p>
        </header>
        <div className={`mx-auto w-full max-w-xl p-8 ${landingCard}`}>
          <div className="mb-5 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-neutral-800 text-white">
              <Globe className="size-6" />
            </div>
            <h2 className="text-lg font-semibold text-neutral-900">Add your first website</h2>
            <p className="mt-2 text-sm text-neutral-500">
              Drop a short script on any site to start collecting page views, referrers, and live visitors.
            </p>
          </div>
          <AddSiteForm onCreated={handleSiteCreated} />
          {snippet && (
            <pre className="mt-4 overflow-auto rounded-xl bg-neutral-950 p-3 text-xs text-neutral-100">{snippet}</pre>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-10">
      <header>
        <h1 className="text-xl font-semibold text-neutral-900">Analytics</h1>
        <p className="text-neutral-600">
          Privacy-friendly website analytics — page views, referrers, locations, and live visitors.
        </p>
      </header>

      {!hasData && !loading && selectedSite && (
        <div className={`${landingCard} p-4 sm:p-5`}>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100">
              <Zap className="size-5 text-neutral-900" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-neutral-900">Waiting for the first event</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Add this snippet to the <code className="rounded bg-neutral-100 px-1">&lt;head&gt;</code> of{" "}
                <span className="font-medium text-neutral-900">{selectedSite.domain}</span>.
              </p>
              <pre className="mt-3 overflow-auto rounded-xl bg-neutral-950 p-3 text-xs text-neutral-100">
                {trackingSnippet(typeof window === "undefined" ? "" : window.location.origin, selectedSite.site_id)}
              </pre>
              <ThreeDButton variant="solid" className="mt-3 rounded-xl" onClick={copySnippet}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy code"}
              </ThreeDButton>
            </div>
          </div>
        </div>
      )}

      <AnalyticsChart
        stats={stats}
        visitorsNow={visitorsNow}
        data={timeline}
        range={range}
        onRangeChange={setRange}
        selectedSiteId={selectedSiteId}
        onSiteChange={onSiteChange}
      />

      <section id="pages" className="flex scroll-mt-4 flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Pages</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <BreakdownCard title="Top pages" data={pages} />
          <BreakdownCard title="Hostnames" data={hostnames} />
          <BreakdownCard title="Entry pages" data={entryPages} />
          <BreakdownCard title="Exit pages" data={exitPages} />
        </div>
      </section>

      <section id="referrers" className="flex scroll-mt-4 flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Referrers</h2>
        <BreakdownCard title="Top referrers" data={referrers} />
      </section>

      <section id="locations" className="flex scroll-mt-4 flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Locations</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <BreakdownCard title="Countries" data={countries} type="country" />
          <BreakdownCard title="Regions" data={regions} />
          <BreakdownCard title="Cities" data={cities} />
        </div>
      </section>

      <section id="devices" className="flex scroll-mt-4 flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Devices</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <BreakdownCard title="Device" data={devices} />
          <BreakdownCard title="Browser" data={browsers} />
          <BreakdownCard title="OS" data={oses} />
        </div>
      </section>

      <SitesSection sites={sites} onCreated={handleSiteCreated} />
    </div>
  );
}
