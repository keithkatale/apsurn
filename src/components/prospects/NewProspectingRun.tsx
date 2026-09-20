"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Square } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { CopilotMarkdown } from "@/components/copilot/CopilotMarkdown";
import { AgentActivityItem, type AgentActivityItemData } from "@/components/prospects/AgentActivity";
import { ScanOverlay, type ScanLogEntry } from "@/components/progress/ScanOverlay";
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


/** Turns a raw agent tool call into a line a user can follow. */
function describeTool(name: string, args: Record<string, unknown>): string {
  const str = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : "");
  const host = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };
  switch (name) {
    case "web_search":
      return `Searching for "${str("query")}"`;
    case "open_page":
      return `Reading ${host(str("url"))}`;
    case "extract_companies":
      return `Pulling companies from ${host(str("url"))}`;
    case "find_leads":
      return "Searching the contact database for matching decision makers";
    case "find_people":
      return `Looking up decision makers at ${str("domain")}`;
    case "extract_people":
      return `Reading the team page at ${host(str("url"))}`;
    case "find_companies":
      return `Pulling companies from ${str("source")}`;
    case "check_hiring_signal":
      return `Checking open roles at ${str("domain")}`;
    case "qualify":
      return `Qualifying ${str("fullName") || "a contact"} at ${str("companyName") || "a company"}`;
    case "resolve_email":
      return `Resolving an email for ${str("fullName") || "a contact"}`;
    case "save_lead":
      return "Saving a qualified lead";
    default:
      return name;
  }
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
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
  const [summary, setSummary] = useState<{ found: number; contactCount: number; warnings: number; stopReason?: string } | null>(null);
  const [logs, setLogs] = useState<ScanLogEntry[]>([]);
  const [leadsFound, setLeadsFound] = useState(0);
  const leadsFoundRef = useRef(0);
  const [budget, setBudget] = useState<{ targetCount: number; wallclockMs: number } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);

  // Drives the elapsed/remaining readout while the run is in flight.
  useEffect(() => {
    if (phase !== "running" || startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase, startedAt]);

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
            case "meta": {
              if (typeof event.targetCount === "number" && typeof event.wallclockMs === "number") {
                setBudget({ targetCount: event.targetCount, wallclockMs: event.wallclockMs });
              }
              break;
            }
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
              setLogs((prev) => [...prev, { id: uid(), text: describeTool(event.name, event.args ?? {}) }].slice(-18));
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
                leadsFoundRef.current += 1;
                setLeadsFound(leadsFoundRef.current);
                setLogs((prev) => [...prev, { id: uid(), text: "Saved a qualified lead" }].slice(-18));
                onLeadSaved?.();
              }
              break;
            }
            case "done": {
              sawTerminalEvent = true;
              setSummary({
                found: event.found,
                contactCount: event.contactCount,
                warnings: event.warnings,
                stopReason: event.stopReason,
              });
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
      // The stream ended without a "done"/"error" event, so the run did not
      // finish — the connection was cut (request timeout, instance recycled).
      // Reporting this as success left a half-finished run looking complete.
      if (!sawTerminalEvent) {
        setError("The connection to the server was lost before the run finished. Any leads found so far were saved.");
        setPhase("error");
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        // Only the Stop button aborts now. Report it as a stop with whatever
        // was saved, rather than an empty panel that just says "Finished".
        setSummary({ found: leadsFoundRef.current, contactCount: 0, warnings: 0, stopReason: "stopped by you" });
        setPhase("done");
        onRunFinished?.();
      } else {
        setError(err instanceof Error ? err.message : "Prospecting failed");
        setPhase("error");
      }
    }
  }, [criteria, onLeadSaved, onRunFinished]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStartedAt(Date.now());
    runSearch();
    // Deliberately no abort on unmount: React's development double-invoke
    // mounts, unmounts and remounts this panel, and aborting there killed the
    // run while the `startedRef` guard stopped it being restarted — leaving a
    // blank panel headed "Finished". Stopping is an explicit user action, and
    // the server drops the work when the request stream is cancelled anyway.
  }, [runSearch]);

  function stop() {
    abortRef.current?.abort();
  }

  // Progress is the better of "leads saved against the target" and "time spent
  // against the run's budget", so the bar keeps moving during the long
  // stretches between saves without ever implying more progress than the leads
  // actually represent.
  const elapsedMs = startedAt === null ? 0 : now - startedAt;
  const leadProgress = budget && budget.targetCount > 0 ? (leadsFound / budget.targetCount) * 100 : 0;
  const timeProgress = budget && budget.wallclockMs > 0 ? (elapsedMs / budget.wallclockMs) * 100 : 0;
  const progress = Math.min(99, Math.max(leadProgress, timeProgress));

  const remainingMs = budget ? Math.max(0, budget.wallclockMs - elapsedMs) : 0;
  const detail = budget
    ? `${leadsFound} of ${budget.targetCount} leads · up to ${formatDuration(remainingMs)} left`
    : `${leadsFound} lead${leadsFound === 1 ? "" : "s"} so far`;

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
          {phase === "running" && (
            <ScanOverlay
              state={{ phase: "scanning", progress, logs }}
              kicker="Enriching prospects"
              title="Finding qualified leads"
              runningLabel="Working"
              detail={detail}
            />
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

          {summary &&
            (summary.found === 0 ? (
              // A run that saves nothing is not a success. Say what stopped it
              // and what to change — "finished" alone reads as though it
              // worked and there was simply nobody to find.
              <div className="mt-2 flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <span className="font-medium">No leads were saved.</span>
                <span className="text-xs leading-relaxed">
                  {summary.stopReason === "time budget reached"
                    ? "The run ran out of time before it could qualify anyone. This usually means the targets it found don't publish named contacts — try narrower industries, or personas that appear on company websites."
                    : summary.stopReason === "model finished"
                      ? "The agent stopped early without saving anyone. Try broadening the industries or geographies."
                      : `The run stopped: ${summary.stopReason ?? "no reason reported"}.`}
                </span>
              </div>
            ) : (
              <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
                Found {summary.found} compan{summary.found === 1 ? "y" : "ies"} · {summary.contactCount} contact
                {summary.contactCount === 1 ? "" : "s"}
                {summary.warnings > 0 ? ` · ${summary.warnings} skipped` : ""}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
