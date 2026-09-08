"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity } from "lucide-react";
import { SiteSelector } from "./SiteSelector";
import { landingCard, landingSelect } from "./styles";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { formatDuration } from "@/lib/analytics/range";
import type { AnalyticsStats, TimelinePoint } from "@/lib/analytics/types";

export function AnalyticsChart({
  stats,
  visitorsNow,
  data,
  range,
  onRangeChange,
  selectedSiteId,
  onSiteChange,
}: {
  stats: AnalyticsStats;
  visitorsNow: number;
  data: TimelinePoint[];
  range: string;
  onRangeChange: (range: string) => void;
  selectedSiteId: string | null;
  onSiteChange: (siteId: string) => void;
}) {
  function formatXAxis(tickItem: string) {
    if (!tickItem) return "";
    const date = new Date(tickItem);
    if (range === "24h") {
      return date.toLocaleTimeString([], { hour: "numeric", hour12: true }).toLowerCase().replace(" ", "");
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return (
    <div className={`${landingCard} p-4 sm:p-5`}>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <SiteSelector selectedSiteId={selectedSiteId} onSiteChange={onSiteChange} />
          <select
            className={landingSelect}
            value={range}
            onChange={(event) => onRangeChange(event.target.value)}
          >
            <option value="24h">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>
        <ThreeDButton
          href={
            selectedSiteId
              ? `/dashboard/analytics/realtime?siteId=${encodeURIComponent(selectedSiteId)}`
              : "/dashboard/analytics/realtime"
          }
          target="_blank"
          rel="noopener noreferrer"
          variant="soft"
          className="shrink-0 rounded-xl"
        >
          <Activity className="size-4" />
          Realtime view
        </ThreeDButton>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Visitors" value={stats.visitors.toLocaleString()} />
        <Metric label="Bounce rate" value={`${stats.bounceRate}%`} />
        <Metric label="Session time" value={formatDuration(stats.avgSessionTime)} />
        <Metric
          label="Visitors now"
          value={String(visitorsNow)}
          live
        />
      </div>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="apsurnVisitors" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4379EE" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#4379EE" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
            <XAxis
              dataKey="date"
              tickFormatter={formatXAxis}
              stroke="#a3a3a3"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              dy={10}
              minTickGap={40}
            />
            <YAxis
              stroke="#a3a3a3"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "#fff",
                border: "1px solid #e5e5e5",
                borderRadius: 8,
                fontSize: 13,
              }}
              labelFormatter={(label) =>
                new Date(String(label)).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              }
              formatter={(value) => [String(value), "Visitors"]}
            />
            <Area
              type="monotone"
              dataKey="visitors"
              stroke="#4379EE"
              strokeWidth={2}
              fill="url(#apsurnVisitors)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Metric({ label, value, live }: { label: string; value: string; live?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-sm text-neutral-500">
        {label}
        {live && <span className="size-1.5 rounded-full bg-[#4379EE]" />}
      </div>
      <div className="text-2xl font-semibold text-neutral-900">{value}</div>
    </div>
  );
}
