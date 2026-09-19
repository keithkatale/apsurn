"use client";

import { useEffect, useRef } from "react";
import { ThreeDButton } from "@/components/buttons/three-d-button";

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

export function MarketScanOverlay({ state, onRetry }: { state: ScanState; onRetry?: () => void }) {
  const logsRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const el = logsRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [state.logs]);

  return (
    <div className="w-full rounded-2xl border border-neutral-100 bg-white p-6 shadow-[0px_1px_3px_rgba(0,0,0,0.06)]">
      <div className={`market-scan mx-auto max-w-md ${state.phase === "error" ? "is-failed" : ""}`}>
        <p className="market-scan-kicker">Scanning the web</p>
        <h2>Listening for mentions</h2>

        <div
          className="market-scan-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(state.progress)}
          aria-label="Scan progress"
        >
          <span
            className={`market-scan-bar-fill ${state.phase === "scanning" ? "is-live" : ""}`}
            style={{ width: `${Math.min(100, Math.max(4, state.progress))}%` }}
          />
        </div>

        <div className="market-scan-meta">
          <span>{Math.round(state.progress)}%</span>
          <span>{state.phase === "error" ? "Scan stopped" : state.phase === "done" ? "Done" : "Searching"}</span>
        </div>

        <ol className="market-scan-logs" ref={logsRef}>
          {state.logs.map((entry) => (
            <li key={entry.id}>{entry.text}</li>
          ))}
        </ol>

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
