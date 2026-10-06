"use client";

import { Loader2 } from "lucide-react";

export function rememberProgressLog(prev: string[], label: string): string[] {
  const last = prev[prev.length - 1];
  if (!last) return [label];
  const fold = (value: string) => value.replace(/\d+/g, "#");
  if (fold(last) === fold(label)) return [...prev.slice(0, -1), label];
  return [...prev, label].slice(-8);
}

export function CsvImportProgress({
  progress,
  label,
  logs,
}: {
  progress: number;
  label: string;
  logs: string[];
}) {
  const shown = Math.max(4, Math.min(100, progress));
  const history = logs.filter((line) => line !== label).slice(-3);

  return (
    <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-4 shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4379EE]">CSV</p>
      <p className="mt-1 flex items-start gap-2 text-[14px] font-semibold leading-snug text-neutral-900">
        <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-[#4379EE]" />
        <span>{label}</span>
      </p>
      <div
        className="copilot-run-bar mt-3"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(shown)}
        aria-label={label}
      >
        <span className="copilot-run-bar-fill is-live" style={{ width: `${shown}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-neutral-500">{Math.round(shown)}%</p>
      {history.length > 0 && (
        <ul className="mt-3 space-y-1">
          {history.map((line, index) => (
            <li key={`${index}-${line}`} className="text-[12px] leading-snug text-neutral-400">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
