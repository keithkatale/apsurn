"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import type { ToolItem } from "@/lib/agents/timeline";
import { ToolBody } from "./tool-bodies";
import { ToolTrailing } from "./tool-trailing";
import { formatElapsed, toolPhrase } from "./tool-phrases";

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

/** One tool call: what it is acting on, its state (running with a live timer, done, or failed with the reason), and its output. */
export function ToolRow({ tool, latest = false }: { tool: ToolItem; latest?: boolean }) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const running = tool.status === "running";
  const now = useNow(running);
  // A tool shows its output as soon as it has any, so results are seen without a click. Only older finished steps
  // fold to a line to keep the window short; clicking reopens them.
  const open = userOpen ?? (running || latest || tool.status === "failed" || tool.status === "done");
  const elapsed = running ? now - tool.startedAt : tool.ms;

  return (
    <div className="cpt-tool" data-status={tool.status}>
      <button type="button" className="cpt-tool-head" aria-expanded={open} onClick={() => setUserOpen(!open)}>
        <span className="inline-flex size-4 shrink-0 items-center justify-center">
          {running ? (
            <Loader2 className="size-3 animate-spin text-[var(--copilot-accent)]" />
          ) : tool.status === "failed" ? (
            <X className="size-3 text-red-500" />
          ) : (
            <Check className="size-3 text-emerald-500/80" />
          )}
        </span>
        <span className="cpt-tool-phrase">{toolPhrase(tool)}</span>
        <ToolTrailing tool={tool} />
        <span className="flex-1" />
        {elapsed != null ? <span className="cpt-tool-meta">{formatElapsed(elapsed)}</span> : null}
        <ChevronDown className={`size-3 shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div className="cpt-collapse" data-open={open}>
        <div className="cpt-collapse-inner">
          <div className="cpt-tool-body">
            <ToolBody tool={tool} />
          </div>
        </div>
      </div>
    </div>
  );
}
