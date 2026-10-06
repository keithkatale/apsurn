"use client";

import { ChevronsUpDownIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { createContext, useContext } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/cn";

interface PlanContextValue {
  isStreaming: boolean;
}

const PlanContext = createContext<PlanContextValue | null>(null);

function usePlan() {
  const context = useContext(PlanContext);
  if (!context) throw new Error("Plan components must be used within Plan");
  return context;
}

export type PlanProps = ComponentProps<typeof Collapsible> & { isStreaming?: boolean };

export function Plan({ className, isStreaming = false, children, ...props }: PlanProps) {
  return (
    <PlanContext.Provider value={{ isStreaming }}>
      <Collapsible
        data-slot="plan"
        className={cn("rounded-xl border border-[var(--copilot-card-border)] bg-[var(--copilot-card)] text-[var(--copilot-foreground)]", className)}
        {...props}
      >
        {children}
      </Collapsible>
    </PlanContext.Provider>
  );
}

export function PlanHeader({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="plan-header" className={cn("flex items-start justify-between gap-3 px-4 pt-4", className)} {...props} />;
}

export function PlanTitle({ className, children, ...props }: Omit<ComponentProps<"h3">, "children"> & { children: string }) {
  const { isStreaming } = usePlan();
  return (
    <h3 data-slot="plan-title" className={cn("text-[15px] font-semibold leading-snug", className)} {...props}>
      {isStreaming ? <span className="copilot-reason-shimmer">{children}</span> : children}
    </h3>
  );
}

export function PlanDescription({ className, children, ...props }: Omit<ComponentProps<"p">, "children"> & { children: string }) {
  const { isStreaming } = usePlan();
  return (
    <p data-slot="plan-description" className={cn("mt-1 text-balance text-[13px] leading-snug text-[var(--copilot-muted)]", className)} {...props}>
      {isStreaming ? <span className="copilot-reason-shimmer">{children}</span> : children}
    </p>
  );
}

export function PlanAction({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="plan-action" className={cn("shrink-0", className)} {...props} />;
}

export function PlanTrigger({ className, ...props }: ComponentProps<typeof CollapsibleTrigger>) {
  return (
    <CollapsibleTrigger
      data-slot="plan-trigger"
      aria-label="Toggle plan"
      className={cn("inline-flex size-7 items-center justify-center rounded-md text-[var(--copilot-muted)] hover:bg-[var(--copilot-dropdown-hover)]", className)}
      {...props}
    >
      <ChevronsUpDownIcon className="size-4" />
    </CollapsibleTrigger>
  );
}

export function PlanContent({ className, ...props }: ComponentProps<typeof CollapsibleContent>) {
  return <CollapsibleContent data-slot="plan-content" className={cn("px-4 pt-3", className)} {...props} />;
}

export function PlanFooter({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="plan-footer" className={cn("flex flex-wrap items-center gap-2 px-4 pb-4 pt-3", className)} {...props} />;
}
