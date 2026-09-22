"use client";

import { cn } from "@/lib/cn";

export const SETUP_STEPS = [
  { n: 1, label: "Research company" },
  { n: 2, label: "Explore competitors" },
  { n: 3, label: "Define campaigns" },
  { n: 4, label: "Find accounts" },
  { n: 5, label: "Open campaigns" },
];

export function SetupStepper({ current }: { current: number }) {
  return (
    <ol className="flex w-full items-center gap-1 sm:gap-2">
      {SETUP_STEPS.map((step, index) => {
        const done = current > step.n;
        const active = current === step.n;
        return (
          <li key={step.n} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold sm:size-7 sm:text-xs",
                  active && "bg-[#4379EE] text-white",
                  done && "bg-neutral-900 text-white",
                  !active && !done && "border border-neutral-200 bg-white text-neutral-400",
                )}
              >
                {step.n}
              </span>
              <span
                className={cn(
                  "truncate text-[11px] font-medium sm:text-sm",
                  active ? "text-neutral-900" : "text-neutral-400",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < SETUP_STEPS.length - 1 && <span className="hidden h-px flex-1 bg-neutral-200 sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}
