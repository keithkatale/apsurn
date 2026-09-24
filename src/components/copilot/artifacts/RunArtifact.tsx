"use client";

import { useEffect, useState } from "react";
import type { CopilotArtifact } from "@/lib/agents/types";
import { CompanyFavicon } from "@/components/prospects/CompanyFavicon";
import { ContactAvatar } from "@/components/prospects/ContactAvatar";

interface RunLead {
  company: string;
  domain?: string | null;
  name: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl?: string | null;
}

interface RunStatus {
  status?: string;
  stage?: string;
  processed_count?: number;
  target_count?: number;
  contact_count?: number;
  error_summary?: string | null;
  created_at?: string;
  leads?: RunLead[];
}

const RUN_BUDGET_MS = 8 * 60_000;

export function RunArtifact({
  artifact,
  expanded = false,
}: {
  artifact: CopilotArtifact;
  expanded?: boolean;
  onChange?: (next: CopilotArtifact) => void;
}) {
  const runId = String(artifact.payload.runId ?? "");
  const [run, setRun] = useState<RunStatus>({
    status: String(artifact.payload.status ?? "queued"),
    target_count: typeof artifact.payload.limit === "number" ? artifact.payload.limit : undefined,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!runId) return;
    let stopped = false;
    async function tick() {
      const res = await fetch(`/api/prospecting/run/${runId}`);
      if (!res.ok || stopped) return;
      const data = (await res.json()) as RunStatus;
      setRun(data);
      if (data.status === "completed" || data.status === "failed" || data.status === "cancelled" || data.status === "partial") {
        stopped = true;
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 4000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [runId]);

  const done = run.status === "completed" || run.status === "partial" || run.status === "failed" || run.status === "cancelled";

  useEffect(() => {
    if (done) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [done]);

  async function cancel() {
    const res = await fetch(`/api/prospecting/run/${runId}/cancel`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? "Cancelling…" : data.error ?? "Could not cancel");
  }

  const criteria = artifact.payload.criteria && typeof artifact.payload.criteria === "object" ? (artifact.payload.criteria as Record<string, unknown>) : {};
  const industries = Array.isArray(criteria.industries) ? criteria.industries.join(", ") : "";
  const target = run.target_count ?? (typeof artifact.payload.limit === "number" ? artifact.payload.limit : 0);
  const saved = run.processed_count ?? 0;
  const leadProgress = target > 0 ? (saved / target) * 100 : 0;
  const started = run.created_at ? new Date(run.created_at).getTime() : now;
  const timeProgress = ((now - started) / RUN_BUDGET_MS) * 40;
  const progress = done ? (run.status === "failed" || run.status === "cancelled" ? leadProgress : 100) : Math.min(99, Math.max(leadProgress, timeProgress, 6));
  const leads = run.leads ?? [];
  const label = done ? (run.status === "completed" ? "Done" : run.status ?? "Stopped") : "Searching";

  return (
    <div>
      <p className="copilot-artifact-kicker">Prospecting run</p>
      <h3 className="copilot-artifact-title mt-1">{run.status === "queued" ? "Queued" : run.stage || run.status}</h3>
      <div className="copilot-run-bar mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <span className={`copilot-run-bar-fill ${done ? "" : "is-live"}`} style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[12px] text-[var(--copilot-muted)]">
        <span>{Math.round(progress)}%</span>
        <span>{label}</span>
      </div>
      <p className="copilot-artifact-meta mt-1">
        {saved} / {target || "?"} companies
        {typeof run.contact_count === "number" ? ` · ${run.contact_count} contacts` : ""}
        {typeof artifact.payload.creditsPerCompany === "number" ? ` · ${artifact.payload.creditsPerCompany} credits each` : ""}
      </p>
      {industries ? <p className="mt-2 text-[13px] text-[var(--copilot-muted)]">{industries}</p> : null}
      {run.error_summary ? <p className="mt-2 text-[13px] text-red-500">{run.error_summary}</p> : null}

      {expanded ? (
        <div className="mt-4">
          <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--copilot-muted)]">Leads</p>
          {leads.length === 0 ? (
            <p className="mt-2 text-[13px] text-[var(--copilot-muted)]">
              {done ? "This run did not save any leads." : "Leads show up here as they are saved."}
            </p>
          ) : (
            <ul className="mt-2">
              {leads.map((lead, index) => (
                <li key={`${lead.company}-${lead.email ?? index}`} className="copilot-lead">
                  <ContactAvatar name={lead.name} linkedinUrl={lead.linkedinUrl} email={lead.email} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="copilot-lead-name block">{lead.name || lead.company}</span>
                    {lead.title ? <span className="mt-0.5 block text-[12px] text-[var(--copilot-muted)]">{lead.title}</span> : null}
                    <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-[var(--copilot-muted)]">
                      <CompanyFavicon domain={lead.domain || lead.company} name={lead.company} className="size-3.5" />
                      <span className="truncate">{lead.company}</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {!done ? (
          <button type="button" className="copilot-artifact-btn" onClick={() => void cancel()}>
            Cancel
          </button>
        ) : null}
        <a className="copilot-artifact-btn" href="/dashboard/prospects">
          Open Prospects
        </a>
      </div>
      {message ? <p className="mt-2 text-[13px] text-[var(--copilot-muted)]">{message}</p> : null}
    </div>
  );
}
