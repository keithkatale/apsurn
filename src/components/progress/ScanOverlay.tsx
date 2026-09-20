"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

/**
 * Progress bar + live log feed for long-running work.
 *
 * Extracted from the market-insights scan so prospecting runs present the
 * same way: a long job that shows what it is doing while it does it, rather
 * than an empty panel that only reports an outcome at the end. The done
 * state also lives here now — a checkmark, an optional summary, and an
 * optional restart action — so a finished run's outcome is the last line of
 * the same widget the run played out in, not a separate block underneath it.
 */

export interface ScanLogEntry {
  id: string;
  text: string;
}

export interface ScanState {
  phase: "scanning" | "done" | "error";
  progress: number;
  logs: ScanLogEntry[];
  error?: string | null;
}

export function ScanOverlay({
  state,
  kicker,
  title,
  runningLabel = "Searching",
  doneLabel = "Done",
  errorLabel = "Stopped",
  detail,
  /** Shown under the log list once phase is "done" — e.g. "6 companies · 6 contacts". */
  summary,
  onRestart,
  restartLabel = "Run again",
  onRetry,
}: {
  state: ScanState;
  kicker: string;
  title: string;
  runningLabel?: string;
  doneLabel?: string;
  errorLabel?: string;
  /** Secondary line under the bar, e.g. "3 of 15 leads · 2m 10s left". */
  detail?: string;
  summary?: ReactNode;
  /** Shown as a button once phase is "done". */
  onRestart?: () => void;
  restartLabel?: string;
  onRetry?: () => void;
}) {
  const logsRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = logsRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [state.logs]);

  return (
    <div className="w-full rounded-2xl border border-neutral-100 bg-white p-6 shadow-[0px_1px_3px_rgba(0,0,0,0.06)]">
      <div className={`market-scan mx-auto max-w-md ${state.phase === "error" ? "is-failed" : ""}`}>
        <p className="market-scan-kicker">{kicker}</p>
        <h2>{title}</h2>

        <div
          className="market-scan-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(state.progress)}
          aria-label={title}
        >
          <span
            className={`market-scan-bar-fill ${state.phase === "scanning" ? "is-live" : ""}`}
            style={{ width: `${Math.min(100, Math.max(4, state.progress))}%` }}
          />
        </div>

        <div className="market-scan-meta">
          <span>{Math.round(state.progress)}%</span>
          <span className="inline-flex items-center gap-1">
            {state.phase === "done" && <CheckCircle2 className="size-3.5 text-emerald-600" />}
            {state.phase === "error" ? errorLabel : state.phase === "done" ? doneLabel : runningLabel}
          </span>
        </div>

        {detail && <p className="mt-2 text-center text-xs text-neutral-500">{detail}</p>}

        <ol className="market-scan-logs" ref={logsRef}>
          {state.logs.map((entry) => (
            <li key={entry.id}>{entry.text}</li>
          ))}
        </ol>

        {state.phase === "done" && summary && (
          <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">{summary}</div>
        )}

        {state.phase === "done" && onRestart && (
          <div className="mt-4 flex justify-center">
            <ThreeDButton type="button" variant="solid" size="sm" onClick={onRestart}>
              {restartLabel}
            </ThreeDButton>
          </div>
        )}

        {state.phase === "error" && (
          <div className="mt-4 flex flex-col items-center gap-2">
            {state.error && <p className="text-sm text-red-600">{state.error}</p>}
            {onRetry && (
              <ThreeDButton type="button" variant="solid" size="sm" onClick={onRetry}>
                Try again
              </ThreeDButton>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
