"use client";

import { RefreshCw, RotateCw } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { GlobeVisualization } from "./GlobeVisualization";
import { countryFlag } from "@/lib/analytics/range";
import type { LiveVisitor } from "@/lib/analytics/types";

export function RealtimeSection({
  visitors,
  domain,
  autoRotate,
  onToggleRotate,
  onRefresh,
  fullPage = false,
}: {
  visitors: LiveVisitor[];
  domain: string | null;
  autoRotate: boolean;
  onToggleRotate: () => void;
  onRefresh: () => void;
  fullPage?: boolean;
}) {
  const referrers = visitors.reduce<Record<string, number>>((acc, visitor) => {
    acc[visitor.referrer] = (acc[visitor.referrer] ?? 0) + 1;
    return acc;
  }, {});
  const countries = visitors.reduce<Record<string, number>>((acc, visitor) => {
    acc[visitor.country] = (acc[visitor.country] ?? 0) + 1;
    return acc;
  }, {});
  const devices = visitors.reduce<Record<string, number>>((acc, visitor) => {
    acc[visitor.device] = (acc[visitor.device] ?? 0) + 1;
    return acc;
  }, {});

  const controls = (
    <div className="flex items-center gap-2">
      <ThreeDButton
        variant={autoRotate ? "solid" : "soft"}
        size="icon"
        className="size-9 rounded-xl"
        title={autoRotate ? "Pause rotation" : "Start rotation"}
        onClick={onToggleRotate}
      >
        <RotateCw className="size-4" />
      </ThreeDButton>
      <ThreeDButton variant="soft" size="icon" className="size-9 rounded-xl" title="Refresh" onClick={onRefresh}>
        <RefreshCw className="size-4" />
      </ThreeDButton>
    </div>
  );

  return (
    <section id="realtime" className="flex scroll-mt-4 flex-col gap-3">
      {fullPage ? <div className="flex justify-end">{controls}</div> : (
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Realtime</h2>
          {controls}
        </div>
      )}

      <div
        className={`relative overflow-hidden bg-[#FAFAFA] ${
          fullPage ? "h-[calc(100vh-14rem)] min-h-[520px]" : "h-[520px]"
        }`}
      >
        <div className="absolute inset-0 z-[1]">
          <GlobeVisualization visitors={visitors} autoRotate={autoRotate} />
        </div>

        <div className="absolute left-4 top-4 z-10 w-80 p-4">
          <p className="mb-3 text-xs font-semibold tracking-wide text-neutral-500">LIVE VISITORS</p>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-neutral-900">
            <span className="size-2 rounded-full bg-[#4379EE]" />
            <span className="font-semibold">{visitors.length} visitors on</span>
            <span className="font-semibold">{domain ?? "your site"}</span>
          </div>
          <div className="flex flex-col gap-1.5 text-xs text-neutral-500">
            <StatRow label="Referrers" values={Object.entries(referrers).slice(0, 2).map(([name, count]) => `${name} (${count})`)} />
            <StatRow
              label="Countries"
              values={Object.entries(countries).slice(0, 2).map(([code, count]) => `${countryFlag(code)} ${code} (${count})`)}
            />
            <StatRow label="Devices" values={Object.entries(devices).slice(0, 2).map(([name, count]) => `${name} (${count})`)} />
          </div>
        </div>

        <div className="absolute bottom-4 left-4 z-10 w-80 p-4">
          <div className="flex flex-col gap-3 text-sm text-neutral-900">
            {visitors.slice(0, 5).map((visitor, index) => (
              <p key={visitor.id} style={{ opacity: 1 - index * 0.1 }}>
                <span className="font-medium">{visitor.city}</span>
                <span className="text-neutral-500"> from </span>
                {countryFlag(visitor.country)} {visitor.country}
                <span className="text-neutral-500"> visited </span>
                <span className="font-mono text-neutral-800">{visitor.page}</span>
              </p>
            ))}
            {visitors.length === 0 && <p className="text-neutral-500">Waiting for visitors…</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="text-right text-neutral-900">{values.join(" · ") || "—"}</span>
    </div>
  );
}
