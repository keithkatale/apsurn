"use client";

import { useMemo, useState } from "react";
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
  return Array.isArray(raw) ? (raw as SourcedLeadRow[]) : [];
}

export function LeadTableArtifact({
  artifact,
  onChange,
}: {
  artifact: CopilotArtifact;
  onChange?: (next: CopilotArtifact) => void;
}) {
  const [rows, setRows] = useState<SourcedLeadRow[]>(() => rowsOf(artifact));
  const [saved, setSaved] = useState<string[]>(() =>
    Array.isArray(artifact.state.savedRowIds) ? (artifact.state.savedRowIds as string[]) : [],
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sequences, setSequences] = useState<Array<{ id: string; name: string }>>([]);
  const [sequenceId, setSequenceId] = useState("");

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

  async function loadSequences() {
    const res = await fetch("/api/sequences");
    const data = await res.json();
    const list = Array.isArray(data.sequences) ? data.sequences : [];
    setSequences(list);
    if (!sequenceId && list[0]) setSequenceId(list[0].id);
  }

  async function enroll() {
    if (!sequenceId) {
      await loadSequences();
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const saveRes = await fetch(`/api/copilot/artifacts/${artifact.id}/save-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rowIds: unsavedSelected.length ? unsavedSelected : selected }),
      });
      const savedData = await saveRes.json();
      const contactIds = Array.isArray(savedData.contactIds) ? savedData.contactIds.filter(Boolean) : [];
      if (contactIds.length === 0) throw new Error(savedData.error ?? "Save leads before enrolling them.");
      const res = await fetch(`/api/sequences/${sequenceId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not enroll");
      setMessage(`Enrolled ${data.enrolled ?? contactIds.length}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enroll");
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
      <p className="copilot-artifact-kicker">Leads · {String(artifact.payload.place ?? artifact.title ?? "Sourced")}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[13px]">
          <thead className="text-[11px] uppercase tracking-wide text-[var(--copilot-muted)]">
            <tr>
              <th className="py-1 pr-2">
                <input type="checkbox" checked={selected.length > 0 && selected.length === allIds.length} onChange={() => setSelected(selected.length === allIds.length ? [] : allIds)} />
              </th>
              <th className="py-1 pr-2">Name</th>
              <th className="py-1 pr-2">Title</th>
              <th className="py-1 pr-2">Company</th>
              <th className="py-1 pr-2">Email</th>
              <th className="py-1">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-[var(--copilot-card-border)] text-[var(--copilot-foreground)]">
                <td className="py-2 pr-2">
                  <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggle(row.id)} />
                </td>
                <td className="py-2 pr-2">{row.fullName || "—"}{saved.includes(row.id) ? " · saved" : ""}</td>
                <td className="py-2 pr-2 text-[var(--copilot-muted)]">{row.title || "—"}</td>
                <td className="py-2 pr-2">{row.companyName}{row.domain ? ` · ${row.domain}` : ""}</td>
                <td className="py-2 pr-2">{row.email || "—"}</td>
                <td className="py-2">
                  {row.sourceUrl ? (
                    <a className="underline" href={row.sourceUrl} target="_blank" rel="noreferrer">
                      {row.source}
                    </a>
                  ) : (
                    row.source
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="py-3 text-[13px] text-[var(--copilot-muted)]">No rows came back.</p> : null}
      </div>
      <p className="mt-2 text-[12px] text-[var(--copilot-muted)]">
        {unsavedSelected.length} selected · {cost} credits to save
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="copilot-artifact-btn copilot-artifact-btn-solid" disabled={busy || unsavedSelected.length === 0} onClick={() => void save()}>
          Save to Prospects
        </button>
        <button type="button" className="copilot-artifact-btn" disabled={busy || selected.length === 0} onClick={() => void findEmails()}>
          Find emails
        </button>
        <button type="button" className="copilot-artifact-btn" disabled={busy || selected.length === 0} onClick={() => (sequences.length ? void enroll() : void loadSequences())}>
          {sequences.length ? "Enroll into campaign" : "Choose campaign"}
        </button>
        <button type="button" className="copilot-artifact-btn" disabled={selected.length === 0} onClick={exportCsv}>
          Export CSV
        </button>
        <a className="copilot-artifact-btn" href="/dashboard/prospects">
          Open Prospects
        </a>
      </div>
      {sequences.length > 0 ? (
        <select className="copilot-artifact-input mt-2" value={sequenceId} onChange={(event) => setSequenceId(event.target.value)}>
          {sequences.map((sequence) => (
            <option key={sequence.id} value={sequence.id}>
              {sequence.name}
            </option>
          ))}
        </select>
      ) : null}
      {message ? <p className="mt-2 text-[13px] text-[var(--copilot-muted)]">{message}</p> : null}
    </div>
  );
}
