"use client";

/**
 * Reasoning (AI Elements): a collapsible that opens while the agent works and closes when it finishes. Here the work
 * itself (thinking and tool calls) lives inside it, and the trigger line is the live status with a text shimmer.
 */
import * as Collapsible from "@radix-ui/react-collapsible";
import { Brain, ChevronDown } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

export function useReasoning(): ReasoningContextValue {
  const value = useContext(ReasoningContext);
  if (!value) throw new Error("Reasoning components must be used within <Reasoning>");
  return value;
}

const AUTO_CLOSE_DELAY_MS = 900;

export type ReasoningProps = Omit<ComponentProps<typeof Collapsible.Root>, "open" | "defaultOpen" | "onOpenChange"> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Seconds to show once finished. Measured here from when streaming began when not given. */
  duration?: number;
};

export function Reasoning({ className, isStreaming = false, open, defaultOpen, onOpenChange, duration: durationProp, children, ...props }: ReasoningProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? isStreaming);
  const isOpen = open ?? uncontrolledOpen;
  const [measured, setMeasured] = useState<number | undefined>(undefined);
  const startedRef = useRef<number | null>(null);
  const touchedRef = useRef(false);

  const setIsOpen = useCallback(
    (next: boolean) => {
      touchedRef.current = true;
      setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  // Open when work starts; measure how long it took; close a moment after it ends (unless the user took over).
  useEffect(() => {
    if (isStreaming) {
      if (startedRef.current === null) startedRef.current = Date.now();
      if (!touchedRef.current) setUncontrolledOpen(true);
      return;
    }
    if (startedRef.current !== null) {
      setMeasured(Math.max(1, Math.round((Date.now() - startedRef.current) / 1000)));
      startedRef.current = null;
      if (!touchedRef.current) {
        const timer = window.setTimeout(() => setUncontrolledOpen(false), AUTO_CLOSE_DELAY_MS);
        return () => window.clearTimeout(timer);
      }
    }
  }, [isStreaming]);

  const value = useMemo(() => ({ isStreaming, isOpen, setIsOpen, duration: durationProp ?? measured }), [isStreaming, isOpen, setIsOpen, durationProp, measured]);

  return (
    <ReasoningContext.Provider value={value}>
      <Collapsible.Root className={cn("not-prose w-full", className)} open={isOpen} onOpenChange={setIsOpen} {...props}>
        {children}
      </Collapsible.Root>
    </ReasoningContext.Provider>
  );
}

export type ReasoningTriggerProps = ComponentProps<typeof Collapsible.Trigger> & {
  /** What the line says: while streaming, and once done. */
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

function defaultMessage(isStreaming: boolean, duration?: number): ReactNode {
  if (isStreaming || duration === undefined) return "Thinking…";
  return `Thought for ${duration} second${duration === 1 ? "" : "s"}`;
}

export function ReasoningTrigger({ className, getThinkingMessage = defaultMessage, children, ...props }: ReasoningTriggerProps) {
  const { isStreaming, isOpen, duration } = useReasoning();
  return (
    <Collapsible.Trigger className={cn("flex w-fit max-w-full items-center gap-1.5 text-[13px] text-[var(--copilot-muted)] transition-colors hover:text-[var(--copilot-foreground)]", className)} {...props}>
      {children ?? (
        <>
          <Brain className="size-3.5 shrink-0" />
          <span className={cn("min-w-0 truncate", isStreaming && "cpt-live-label")}>{getThinkingMessage(isStreaming, duration)}</span>
          <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", isOpen ? "rotate-180" : "rotate-0")} />
        </>
      )}
    </Collapsible.Trigger>
  );
}

export type ReasoningContentProps = ComponentProps<typeof Collapsible.Content>;

export function ReasoningContent({ className, children, ...props }: ReasoningContentProps) {
  return (
    <Collapsible.Content className={cn("cpt-reveal mt-1.5 outline-none", className)} {...props}>
      {children}
    </Collapsible.Content>
  );
}
