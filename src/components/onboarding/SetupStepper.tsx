"use client";

import { cn } from "@/lib/cn";

export const SETUP_STEPS = [
  { n: 1, label: "Research company" },
  { n: 2, label: "Explore competitors" },
  { n: 3, label: "Define campaigns" },
  { n: 4, label: "Find accounts" },
  { n: 5, label: "Open campaigns" },
];

/**
 * `current` is how far setup has progressed; `viewing` is the step on screen.
 * Reached steps are clickable, so people can look back while setup keeps going.
 */
export function SetupStepper({
  current,
  viewing = current,
  onSelect,
}: {
  current: number;
  viewing?: number;
  onSelect?: (step: number) => void;
}) {
  return (
    <ol className="flex w-full items-center gap-1 sm:gap-2">
      {SETUP_STEPS.map((step, index) => {
        const done = current > step.n;
        const live = current === step.n;
        const shown = viewing === step.n;
        const reachable = step.n <= current && Boolean(onSelect);
        const content = (
          <>
            <span
              className={cn(
                "relative flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold sm:size-7 sm:text-xs",
                live && "bg-[#4379EE] text-white",
                done && "bg-neutral-900 text-white",
                !live && !done && "border border-neutral-200 bg-white text-neutral-400",
                shown && "ring-2 ring-[#4379EE]/40 ring-offset-2",
              )}
            >
              {step.n}
              {live && viewing !== step.n ? (
                <span className="absolute -right-0.5 -top-0.5 size-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
              ) : null}
            </span>
            <span className={cn("truncate text-[11px] font-medium sm:text-sm", shown ? "text-neutral-900" : done || live ? "text-neutral-600" : "text-neutral-400")}>
              {step.label}
            </span>
          </>
        );
        return (
          <li key={step.n} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            {reachable ? (
              <button
                type="button"
                onClick={() => onSelect?.(step.n)}
                aria-current={shown ? "step" : undefined}
                title={live ? "Current step" : `Back to ${step.label}`}
                className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md text-left outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-[#4379EE]/50 sm:gap-2"
              >
                {content}
              </button>
            ) : (
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">{content}</div>
            )}
            {index < SETUP_STEPS.length - 1 && <span className="hidden h-px flex-1 bg-neutral-200 sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}
