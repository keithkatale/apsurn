import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function PricingCardShell({
  highlight = false,
  className,
  innerClassName,
  children,
  footer,
}: {
  highlight?: boolean;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-xl p-4",
        highlight
          ? "border border-neutral-300 bg-neutral-100/80 shadow-xs dark:border-neutral-700 dark:bg-neutral-800/80"
          : "border border-neutral-200 bg-neutral-50/60 dark:border-neutral-800 dark:bg-[#121212]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[180px] rounded-b-xl bg-[radial-gradient(#000000_0.85px,transparent_0.85px)] opacity-10 [background-size:17px_17px] dark:opacity-5" />
      <div className="relative z-10 flex h-full flex-col gap-4">
        <div
          className={cn(
            "flex flex-1 flex-col gap-3 rounded-lg border border-neutral-200/80 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 sm:p-5",
            innerClassName,
          )}
        >
          {children}
        </div>
        {footer ? <div className="relative z-10 px-1 pb-1">{footer}</div> : null}
      </div>
    </div>
  );
}
