"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Square } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
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

/** Every step's outcome, turned into one log line — this is now the only place a run's activity is shown. */
function describeToolStart(name: string, args: Record<string, unknown>): string | null {
  const str = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : "");
  switch (name) {
    case "find_companies":
      return "Searching for companies matching your ICP";
    case "find_people":
      return `Looking up decision makers at ${str("domain")}`;
    case "resolve_email":
      return `Resolving an email for ${str("fullName") || "a contact"}`;
    default:
      return null;
  }
}

function describeToolEnd(name: string, args: Record<string, unknown>, result: Record<string, unknown>): string | null {
  const str = (key: string) => (typeof args[key] === "string" ? (args[key] as string) : "");
  switch (name) {
    case "find_companies": {
      if (typeof result.error === "string") return `Couldn't search for companies — ${result.error}`;
      const count = typeof result.count === "number" ? result.count : 0;
      return `Found ${count} compan${count === 1 ? "y" : "ies"} matching your ICP`;
    }
    case "find_people": {
      const domain = str("domain");
      if (typeof result.error === "string") return `Couldn't look up people at ${domain} — ${result.error}`;
      const count = Array.isArray(result.people) ? result.people.length : 0;
      return count > 0 ? `Found ${count} decision ${count === 1 ? "maker" : "makers"} at ${domain}` : `No decision makers listed at ${domain}`;
    }
    case "resolve_email": {
      const who = str("fullName") || "a contact";
      const email = typeof result.email === "string" ? result.email : null;
      const status = typeof result.status === "string" ? ` (${result.status})` : "";
      return email ? `Resolved ${email} for ${who}${status}` : `Could not resolve an email for ${who}`;
    }
    case "save_lead": {
      const company = (args.company ?? {}) as Record<string, unknown>;
      const name = typeof company.name === "string" ? company.name : typeof company.domain === "string" ? company.domain : "a company";
      if (result.saved) {
        const count = typeof result.contactCount === "number" ? result.contactCount : 0;
        return `Saved ${name} — ${count} contact${count === 1 ? "" : "s"}`;
      }
      const reason = typeof result.reason === "string" ? result.reason : null;
      return `Skipped ${name}${reason ? ` (${reason})` : ""}`;
    }
    default:
      return null;
  }
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

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
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ found: number; contactCount: number; warnings: number; stopReason?: string } | null>(null);
  const [logs, setLogs] = useState<ScanLogEntry[]>([]);
  const [leadsFound, setLeadsFound] = useState(0);
  const leadsFoundRef = useRef(0);
  const [budget, setBudget] = useState<{ targetCount: number; wallclockMs: number } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);

  // Drives the elapsed/remaining readout while the run is in flight.
  useEffect(() => {
    if (phase !== "running" || startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase, startedAt]);

  const runSearch = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;

    const requestCriteria = {
      industries: textToList(criteria.industries),
      geographies: textToList(criteria.geographies),
      companySizeRange: criteria.companySizeRange,
      personas: textToList(criteria.personas),
    };

    try {
      const res = await fetch("/api/prospecting/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ version: 1, limit: criteria.limit, criteria: requestCriteria }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Prospecting failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawTerminalEvent = false;

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
            case "tool_start": {
              const text = describeToolStart(event.name, event.args ?? {});
              if (text) setLogs((prev) => [...prev, { id: uid(), text }].slice(-30));
              break;
            }
            case "tool_end": {
              const text = describeToolEnd(event.name, event.args ?? {}, (event.result ?? {}) as Record<string, unknown>);
              if (text) setLogs((prev) => [...prev, { id: uid(), text }].slice(-30));
              if (event.name === "save_lead" && (event.result as { saved?: boolean } | undefined)?.saved) {
                leadsFoundRef.current += 1;
                setLeadsFound(leadsFoundRef.current);
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

  const startedRef = useRef(false);
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

  function runAgain() {
    leadsFoundRef.current = 0;
    setLeadsFound(0);
    setLogs([]);
    setSummary(null);
    setError(null);
    setBudget(null);
    setStartedAt(Date.now());
    setPhase("running");
    runSearch();
  }

  // Progress is the better of "leads saved against the target" and "time spent
  // against the run's budget", so the bar keeps moving during the long
  // stretches between saves without ever implying more progress than the leads
  // actually represent.
  const elapsedMs = startedAt === null ? 0 : now - startedAt;
  const leadProgress = budget && budget.targetCount > 0 ? (leadsFound / budget.targetCount) * 100 : 0;
  const timeProgress = budget && budget.wallclockMs > 0 ? (elapsedMs / budget.wallclockMs) * 100 : 0;
  const progress = phase === "running" ? Math.min(99, Math.max(leadProgress, timeProgress)) : 100;

  const remainingMs = budget ? Math.max(0, budget.wallclockMs - elapsedMs) : 0;
  const detail =
    phase === "running"
      ? budget
        ? `${leadsFound} of ${budget.targetCount} leads · up to ${formatDuration(remainingMs)} left`
        : `${leadsFound} lead${leadsFound === 1 ? "" : "s"} so far`
      : undefined;

  const scanPhase = phase === "running" ? "scanning" : phase === "error" ? "error" : "done";

  const doneSummary =
    phase === "done" && summary ? (
      summary.found === 0 ? (
        // A run that saves nothing is not a success. Say what stopped it and
        // what to change — a bare checkmark would read as though it worked
        // and there was simply nobody to find.
        <div className="flex flex-col gap-1 text-amber-900">
          <span className="font-medium">No leads were saved.</span>
          <span className="text-xs leading-relaxed">
            {summary.stopReason === "no companies matched the ICP"
              ? "No companies matched this ICP in the contact database. Try broadening the industries or geographies."
              : summary.stopReason === "no more companies matched"
                ? "The companies found don't have a listed decision maker matching your target titles. Try broader personas."
                : `The run stopped: ${summary.stopReason ?? "no reason reported"}.`}
          </span>
        </div>
      ) : (
        <span>
          Found {summary.found} compan{summary.found === 1 ? "y" : "ies"} · {summary.contactCount} contact
          {summary.contactCount === 1 ? "" : "s"}
          {summary.warnings > 0 ? ` · ${summary.warnings} skipped` : ""}
        </span>
      )
    ) : undefined;

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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2.5 px-4 py-4">
          <ScanOverlay
            state={{ phase: scanPhase, progress, logs, error }}
            kicker="Enriching prospects"
            title={phase === "running" ? "Finding qualified leads" : phase === "error" ? "Prospecting run" : "Prospecting complete"}
            runningLabel="Working"
            detail={detail}
            summary={doneSummary}
            onRestart={phase === "done" ? runAgain : undefined}
            onRetry={phase === "error" ? runAgain : undefined}
          />
        </div>
      </div>
    </div>
  );
}
