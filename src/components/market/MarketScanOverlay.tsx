"use client";

import { ScanOverlay, type ScanLogEntry, type ScanState } from "@/components/progress/ScanOverlay";

export type { ScanLogEntry, ScanState };

export function MarketScanOverlay({ state, onRetry }: { state: ScanState; onRetry?: () => void }) {
  return (
    <ScanOverlay
      state={state}
      kicker="Scanning the web"
      title="Listening for mentions"
      runningLabel="Searching"
      errorLabel="Scan stopped"
      onRetry={onRetry}
    />
  );
}
