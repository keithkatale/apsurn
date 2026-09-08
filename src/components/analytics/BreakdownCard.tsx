"use client";

import { countryFlag } from "@/lib/analytics/range";
import type { BreakdownItem } from "@/lib/analytics/types";
import { landingCard } from "./styles";

export function BreakdownCard({
  title,
  data,
  type,
}: {
  title: string;
  data: BreakdownItem[];
  type?: "country" | "device";
}) {
  const maxValue = Math.max(...data.map((item) => item.value), 0);

  return (
    <div className={`${landingCard} p-4 sm:p-5`}>
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h3>
      <div className="flex flex-col gap-1">
        {data.length === 0 && <p className="text-sm text-neutral-500">No data yet</p>}
        {data.map((item) => {
          const percent = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
          return (
            <div key={item.name} className="relative flex items-center py-1.5">
              <div
                className="absolute inset-y-0.5 left-0 rounded bg-[#E8F1FC]"
                style={{ width: `${percent}%` }}
              />
              <div className="relative z-10 flex w-full items-center justify-between gap-3 px-2 text-sm">
                <span className="truncate text-neutral-900">
                  {type === "country" && item.code ? `${countryFlag(item.code)} ` : ""}
                  {item.name}
                </span>
                <span className="font-medium text-neutral-900">
                  {item.value}
                  {type === "device" ? "%" : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
