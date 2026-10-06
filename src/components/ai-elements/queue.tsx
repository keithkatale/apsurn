"use client";

import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/cn";

export interface QueueTodo {
  id: string;
  title: string;
  description?: string;
  status?: "pending" | "completed";
}

export function Queue({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="queue" className={cn("flex flex-col gap-2 rounded-lg border border-[var(--copilot-card-border)] px-3 pb-2 pt-2", className)} {...props} />;
}

export function QueueSection({ className, defaultOpen = true, ...props }: ComponentProps<typeof Collapsible>) {
  return <Collapsible defaultOpen={defaultOpen} className={className} {...props} />;
}

export function QueueSectionTrigger({ className, children, ...props }: ComponentProps<"button">) {
  return (
    <CollapsibleTrigger asChild>
      <button
        type="button"
        className={cn("group flex w-full items-center justify-between rounded-md px-1 py-1 text-left text-[var(--copilot-muted)] hover:bg-[var(--copilot-dropdown-hover)]", className)}
        {...props}
      >
        {children}
      </button>
    </CollapsibleTrigger>
  );
}

export function QueueSectionLabel({ count, label, icon, className, ...props }: ComponentProps<"span"> & { count?: number; label: string; icon?: ReactNode }) {
  return (
    <span className={cn("flex items-center gap-2 text-[13px] font-medium", className)} {...props}>
      <ChevronDownIcon className="size-4 transition-transform group-data-[state=closed]:-rotate-90" />
      {icon}
      <span>
        {count} {label}
      </span>
    </span>
  );
}

export function QueueSectionContent({ className, ...props }: ComponentProps<typeof CollapsibleContent>) {
  return <CollapsibleContent className={className} {...props} />;
}

export function QueueList({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("m-0 mt-1 flex list-none flex-col gap-0.5 p-0", className)} {...props} />;
}

export function QueueItem({ className, ...props }: ComponentProps<"li">) {
  return <li className={cn("group flex flex-col gap-1 rounded-md px-1 py-1.5 text-[13px] hover:bg-[var(--copilot-dropdown-hover)]", className)} {...props} />;
}

export function QueueItemIndicator({ completed = false, className, ...props }: ComponentProps<"span"> & { completed?: boolean }) {
  return (
    <span
      className={cn("mt-1 inline-block size-2.5 shrink-0 rounded-full border", completed ? "border-emerald-500/40 bg-emerald-500/40" : "border-[var(--copilot-muted)]", className)}
      {...props}
    />
  );
}

export function QueueItemContent({ completed = false, className, ...props }: ComponentProps<"span"> & { completed?: boolean }) {
  return <span className={cn("line-clamp-1 grow break-words", completed && "text-[var(--copilot-muted)] line-through opacity-70", className)} {...props} />;
}

export function QueueItemDescription({ completed = false, className, ...props }: ComponentProps<"div">  & { completed?: boolean }) {
  return <div className={cn("ml-6 text-[12px] text-[var(--copilot-muted)]", completed && "line-through opacity-60", className)} {...props} />;
}
