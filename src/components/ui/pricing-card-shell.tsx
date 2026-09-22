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
        "relative flex h-full flex-col overflow-hidden rounded-[20px] p-4",
        highlight
          ? "border-2 border-[#CFE2FC] bg-[#E8F1FC] shadow-[0px_4px_20px_0px_rgba(0,0,0,0.15)]"
          : "border border-[#E6E6E6] bg-gradient-to-t from-[#FAFAFA] to-[#F4F4F4]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[180px] rounded-b-[20px] bg-[radial-gradient(#000000_0.85px,transparent_0.85px)] opacity-20 [background-size:17px_17px]" />
      <div className="relative z-10 flex h-full flex-col gap-4">
        <div
          className={cn(
            "flex flex-1 flex-col gap-3 rounded-[12px] bg-white p-4 shadow-[0px_1px_3px_rgba(0,0,0,0.03)] sm:p-5",
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
