"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Square } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { CopilotMarkdown } from "@/components/copilot/CopilotMarkdown";
import { AgentActivityItem, type AgentActivityItemData } from "@/components/prospects/AgentActivity";
import type { ProspectSearchCriteria } from "@/components/prospects/ProspectComposeModal";

function textToList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

let uidCounter = 0;
function uid(): string {
  uidCounter += 1;
  return `item-${Date.now()}-${uidCounter}`;
}

type Item = ({ id: string; kind: "text"; text: string }) | ({ id: string; kind: "tool" } & AgentActivityItemData);

export function NewProspectingRun({
  criteria,
  onLeadSaved,
  onRunFinished,
}: {
  criteria: ProspectSearchCriteria;
  onLeadSaved?: () => void;
  onRunFinished?: () => void;
}) {
  const [phase, setPhase] = useState<"running" | "done" | "error">("running");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ found: number; contactCount: number; warnings: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items, summary, error]);

  const runSearch = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/prospecting/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          version: 1,
          limit: criteria.limit,
          criteria: {
            industries: textToList(criteria.industries),
            geographies: textToList(criteria.geographies),
            companySizeRange: criteria.companySizeRange,
            personas: textToList(criteria.personas),
          },
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Prospecting failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawTerminalEvent = false;
      const local: Item[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const event = JSON.parse(line.slice(5).trim());

          switch (event.type) {
            case "token": {
              const last = local[local.length - 1];
              if (last && last.kind === "text") {
                last.text += event.text;
              } else {
                local.push({ id: uid(), kind: "text", text: event.text });
              }
              setItems([...local]);
              break;
            }
            case "tool_start": {
              local.push({ id: uid(), kind: "tool", name: event.name, status: "running", args: event.args ?? {} });
              setItems([...local]);
              break;
            }
            case "tool_end": {
              for (let i = local.length - 1; i >= 0; i--) {
                const it = local[i];
                if (it.kind === "tool" && it.name === event.name && it.status === "running") {
                  local[i] = { ...it, status: "done", result: event.result };
                  break;
                }
              }
              setItems([...local]);
              if (event.name === "save_lead" && (event.result as { saved?: boolean } | undefined)?.saved) {
                onLeadSaved?.();
              }
              break;
            }
            case "done": {
              sawTerminalEvent = true;
              setSummary({ found: event.found, contactCount: event.contactCount, warnings: event.warnings });
              setPhase("done");
              onRunFinished?.();
              break;
            }
            case "error": {
              sawTerminalEvent = true;
              setError(event.error);
              setPhase("error");
              break;
            }
          }
        }
      }
      if (!sawTerminalEvent) setPhase("done");
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setPhase("done");
      } else {
        setError(err instanceof Error ? err.message : "Prospecting failed");
        setPhase("error");
      }
    }
  }, [criteria, onLeadSaved, onRunFinished]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    runSearch();
    return () => abortRef.current?.abort();
  }, [runSearch]);

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-3 pr-10">
        <div>
          <h1 className="text-sm font-semibold text-neutral-900">Prospecting run</h1>
          <p className="text-xs text-neutral-500">
            {phase === "running" ? "Working…" : phase === "error" ? "Something went wrong" : "Finished"}
          </p>
        </div>
        {phase === "running" && (
          <ThreeDButton type="button" variant="destructive" size="sm" onClick={stop}>
            <Square className="size-3.5" />
            <span>Stop</span>
          </ThreeDButton>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2.5 px-4 py-4">
          {items.length === 0 && phase === "running" && (
            <div className="copilot-typing" aria-label="Working">
              <span />
              <span />
              <span />
            </div>
          )}

          {items.map((item) =>
            item.kind === "tool" ? (
              <AgentActivityItem key={item.id} item={item} />
            ) : (
              <div key={item.id} className="py-1">
                <CopilotMarkdown content={item.text} />
              </div>
            )
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {summary && (
            <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
              Found {summary.found} compan{summary.found === 1 ? "y" : "ies"} · {summary.contactCount} contact
              {summary.contactCount === 1 ? "" : "s"}
              {summary.warnings > 0 ? ` · ${summary.warnings} skipped` : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
