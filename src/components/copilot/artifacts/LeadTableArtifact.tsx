"use client";

import { useEffect, useMemo, useState } from "react";
import type { CopilotArtifact } from "@/lib/agents/types";

interface SourcedLeadRow {
  id: string;
  fullName: string | null;
  title: string | null;
  companyName: string;
  domain: string | null;
  email: string | null;
  emailStatus: string | null;
  phone: string | null;
  sourceUrl: string | null;
  source: string;
}

const CREDIT_PER_COMPANY = 3;

function rowsOf(artifact: CopilotArtifact): SourcedLeadRow[] {
  const raw = artifact.payload.rows;
  if (Array.isArray(raw)) return raw as SourcedLeadRow[];
  const blocks = artifact.payload.blocks;
  if (Array.isArray(blocks)) {
    const tableBlock = blocks.find((b) => b && typeof b === "object" && (b as { type?: string }).type === "table") as { rows?: Array<Record<string, unknown>> } | undefined;
    if (tableBlock && Array.isArray(tableBlock.rows)) {
      return tableBlock.rows.map((r, i) => ({
        id: String(r.id ?? `ui-row-${i}`),
        fullName: String(r.name ?? r.fullName ?? "—"),
        title: String(r.title ?? "—"),
        companyName: String(r.company ?? r.companyName ?? "—"),
        domain: (r.domain as string) ?? null,
        email: (r.email as string) ?? null,
        emailStatus: null,
        phone: (r.phone as string) ?? null,
        sourceUrl: null,
        source: String(r.source ?? r.status ?? "Lead"),
      }));
    }
  }
  return [];
}

export function LeadTableArtifact({
  artifact,
  onChange,
}: {
  artifact: CopilotArtifact;
  onChange?: (next: CopilotArtifact) => void;
}) {
  const [rows, setRows] = useState<SourcedLeadRow[]>(() => rowsOf(artifact));
  const [status, setStatus] = useState<string>(() => String(artifact.payload.status ?? "complete"));
  const [saved, setSaved] = useState<string[]>(() =>
    Array.isArray(artifact.state.savedRowIds) ? (artifact.state.savedRowIds as string[]) : [],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const targetCount = typeof artifact.payload.targetCount === "number" ? artifact.payload.targetCount : null;
  const isScanning = status === "scanning";

  // Poll for background progression when scanning is active
  useEffect(() => {
    if (status !== "scanning") return;
    let mounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/copilot/artifacts/${artifact.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const updated = data.artifact;
        if (!mounted || !updated) return;
        if (Array.isArray(updated.payload?.rows) && updated.payload.rows.length > rows.length) {
          setRows(updated.payload.rows);
          onChange?.(updated);
        }
        if (updated.payload?.status && updated.payload.status !== "scanning") {
          setStatus(String(updated.payload.status));
          if (Array.isArray(updated.payload?.rows)) {
            setRows(updated.payload.rows);
            onChange?.(updated);
          }
        }
      } catch {
        // Silently tolerate polling hiccups
      }
    }, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [artifact.id, status, rows.length, onChange]);

  const unsavedSelected = selected.filter((id) => !saved.includes(id));
  const cost = unsavedSelected.length * CREDIT_PER_COMPANY;
  const allIds = useMemo(() => rows.map((row) => row.id), [rows]);

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function save() {
    if (unsavedSelected.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/copilot/artifacts/${artifact.id}/save-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIds: unsavedSelected }),
      });
      const data = await res.json();
      if (!res.ok && !data.saved) throw new Error(data.error ?? "Could not save");
      const savedRowIds = Array.isArray(data.savedRowIds) ? data.savedRowIds : [...saved, ...unsavedSelected];
      setSaved(savedRowIds);
      setMessage(data.error ? `Saved ${data.saved}. ${data.error}` : `Saved ${data.saved} to Prospects.`);
      onChange?.({ ...artifact, state: { ...artifact.state, savedRowIds } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function findEmails() {
    const missing = selected.filter((id) => rows.find((row) => row.id === id && !row.email && row.domain));
    if (missing.length === 0) {
      setMessage("Selected rows need a company domain and no email yet.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/copilot/artifacts/${artifact.id}/find-emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIds: missing }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Email lookup failed");
      const nextRows = Array.isArray(data.artifact?.payload?.rows) ? data.artifact.payload.rows : rows;
      setRows(nextRows);
      setMessage(`Found ${data.found ?? 0} email${data.found === 1 ? "" : "s"}.`);
      onChange?.({ ...artifact, payload: { ...artifact.payload, rows: nextRows } });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Email lookup failed");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const chosen = rows.filter((row) => selected.includes(row.id));
    const body = ["name,title,company,domain,email,source", ...chosen.map((row) =>
      [row.fullName, row.title, row.companyName, row.domain, row.email, row.sourceUrl].map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","),
    )].join("\n");
    const blob = new Blob([body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "leads.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Leads · {String(artifact.payload.place ?? artifact.title ?? "Sourced")}
        </p>
        {isScanning ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
            </span>
            Scanning background intent... ({rows.length}{targetCount ? `/${targetCount}` : ""})
          </span>
        ) : (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {rows.length} {rows.length === 1 ? "lead" : "leads"} found
          </span>
        )}
      </div>

      <div className="mt-2.5 overflow-x-auto">
        <table className="w-full min-w-[540px] text-left text-[13px]">
          <thead className="border-b border-neutral-200 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            <tr>
              <th className="py-2 pr-2.5">
                <input
                  type="checkbox"
                  className="rounded border-neutral-300 accent-neutral-900 dark:border-neutral-700 dark:accent-white"
                  checked={selected.length > 0 && selected.length === allIds.length}
                  onChange={() => setSelected(selected.length === allIds.length ? [] : allIds)}
                />
              </th>
              <th className="py-2 pr-2.5">Name</th>
              <th className="py-2 pr-2.5">Title</th>
              <th className="py-2 pr-2.5">Company</th>
              <th className="py-2 pr-2.5">Email / Phone</th>
              <th className="py-2">Source / Signal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/80">
            {rows.map((row) => {
              const fullName = row.fullName || (row as unknown as { name?: string }).name || "—";
              const companyName = row.companyName || (row as unknown as { company?: string }).company || "—";
              const contactInfo = [row.email, row.phone].filter(Boolean).join(" · ") || "—";
              const sourceLabel = row.source || (row as unknown as { signal?: string }).signal || "Intent";

              return (
                <tr key={row.id} className="text-neutral-900 transition-colors hover:bg-neutral-50/60 dark:text-neutral-100 dark:hover:bg-neutral-800/40">
                  <td className="py-2.5 pr-2.5">
                    <input
                      type="checkbox"
                      className="rounded border-neutral-300 accent-neutral-900 dark:border-neutral-700 dark:accent-white"
                      checked={selected.includes(row.id)}
                      onChange={() => toggle(row.id)}
                    />
                  </td>
                  <td className="py-2.5 pr-2.5 font-medium">
                    {fullName}
                    {saved.includes(row.id) ? (
                      <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-50 px-1.5 py-0.2 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                        saved
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-2.5 text-neutral-500 dark:text-neutral-400">{row.title || "—"}</td>
                  <td className="py-2.5 pr-2.5">
                    <span className="font-medium">{companyName}</span>
                    {row.domain ? <span className="text-neutral-400 dark:text-neutral-500"> · {row.domain}</span> : ""}
                  </td>
                  <td className="py-2.5 pr-2.5 text-neutral-600 dark:text-neutral-300">{contactInfo}</td>
                  <td className="py-2.5">
                    {row.sourceUrl ? (
                      <a
                        className="underline decoration-neutral-300 transition-colors hover:text-emerald-600 dark:decoration-neutral-700 dark:hover:text-emerald-400"
                        href={row.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {sourceLabel}
                      </a>
                    ) : (
                      sourceLabel
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="py-4 text-center text-[13px] text-neutral-500 dark:text-neutral-400">No leads found in this scan.</p> : null}
      </div>
      <p className="mt-2.5 text-xs text-neutral-500 dark:text-neutral-400">
        {unsavedSelected.length} selected · {cost} credits to save
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white shadow-2xs transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          disabled={busy || unsavedSelected.length === 0}
          onClick={() => void save()}
        >
          Save to Prospects
        </button>
        <button
          type="button"
          className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-2xs transition hover:bg-neutral-50 hover:text-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:hover:text-white"
          disabled={busy || selected.length === 0}
          onClick={() => void findEmails()}
        >
          Find emails
        </button>
        <button
          type="button"
          className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-2xs transition hover:bg-neutral-50 hover:text-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:hover:text-white"
          disabled={selected.length === 0}
          onClick={exportCsv}
        >
          Export CSV
        </button>
        <a
          className="inline-flex items-center rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-2xs transition hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:hover:text-white"
          href="/dashboard/prospects"
        >
          Open Prospects
        </a>
      </div>
      {message ? <p className="mt-2 text-[13px] text-neutral-600 dark:text-neutral-300">{message}</p> : null}
    </div>
  );
}
