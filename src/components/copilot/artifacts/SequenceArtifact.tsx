"use client";

import { useEffect, useState } from "react";
import type { CopilotArtifact } from "@/lib/agents/types";
import { MergeFieldPreview } from "@/components/campaigns/MergeFieldText";
import { CompanyFavicon } from "@/components/prospects/CompanyFavicon";
import { ContactAvatar } from "@/components/prospects/ContactAvatar";

interface Step {
  id: string;
  stepOrder: number;
  delayDays: number;
  subject: string | null;
  body: string;
}

interface LeadOption {
  id: string;
  fullName: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl?: string | null;
  company?: { name?: string | null; domain?: string | null } | null;
}

function stepsOf(artifact: CopilotArtifact): Step[] {
  const raw = artifact.payload.steps;
  if (!Array.isArray(raw)) return [];
  return raw.filter((step) => step && typeof step === "object") as Step[];
}

interface EnrolledLead {
  id: string;
  name: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  company: string | null;
  domain: string | null;
  status: string;
}

export function SequenceArtifact({
  artifact,
  expanded = false,
  onChange,
}: {
  artifact: CopilotArtifact;
  expanded?: boolean;
  onChange?: (next: CopilotArtifact) => void;
}) {
  const sequenceId = String(artifact.payload.sequenceId ?? "");
  const [status, setStatus] = useState(String(artifact.payload.status ?? artifact.state.status ?? "draft"));
  const [steps, setSteps] = useState<Step[]>(() => stepsOf(artifact));
  const [openStep, setOpenStep] = useState<string | null>(steps[0]?.id ?? null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [people, setPeople] = useState<LeadOption[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [enrolledLeads, setEnrolledLeads] = useState<EnrolledLead[]>([]);
  const enrolled = enrolledLeads.length || (Array.isArray(artifact.state.enrolledIds) ? artifact.state.enrolledIds.length : 0);

  useEffect(() => {
    if (!sequenceId) return;
    let cancelled = false;
    async function loadEnrolled() {
      const res = await fetch(`/api/sequences/${sequenceId}`);
      if (!res.ok || cancelled) return;
      const data = await res.json();
      if (Array.isArray(data.leads)) setEnrolledLeads(data.leads as EnrolledLead[]);
    }
    void loadEnrolled();
    return () => {
      cancelled = true;
    };
  }, [sequenceId, artifact.state.enrolledIds]);

  useEffect(() => {
    setSteps(stepsOf(artifact));
    setStatus(String(artifact.payload.status ?? artifact.state.status ?? "draft"));
  }, [artifact]);

  async function remember(patch: { status?: string; enrolledIds?: string[] }) {
    const next: CopilotArtifact = {
      ...artifact,
      payload: { ...artifact.payload, status: patch.status ?? status, steps },
      state: {
        ...artifact.state,
        status: patch.status ?? status,
        enrolledIds: patch.enrolledIds ?? artifact.state.enrolledIds,
      },
    };
    onChange?.(next);
    await fetch(`/api/copilot/artifacts/${artifact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: next.state }),
    });
  }

  async function activate() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not activate");
      setStatus(data.status ?? "active");
      setMessage(data.warning ?? "Campaign is active.");
      await remember({ status: data.status ?? "active" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not activate");
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/outreach/send-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync: true }),
      });
      const data = await res.json();
      if (res.status === 402) throw new Error(data.error ?? "Start a trial to send.");
      if (!res.ok) throw new Error(data.error ?? "Send pass failed");
      setMessage(typeof data.sent === "number" ? `Sent ${data.sent}.` : "Send pass finished.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Send pass failed");
    } finally {
      setBusy(false);
    }
  }

  async function schedule() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/schedule`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not schedule");
      setStatus("active");
      setMessage(data.scheduled ? `Scheduled ${data.scheduled} for the next hour.` : "No one is enrolled yet.");
      await remember({ status: "active" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not schedule");
    } finally {
      setBusy(false);
    }
  }

  async function loadPeople() {
    setPeopleOpen(true);
    const res = await fetch("/api/contacts?limit=40");
    const data = await res.json();
    setPeople(Array.isArray(data.contacts) ? data.contacts : []);
  }

  async function enroll() {
    if (picked.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: picked }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not enroll");
      const enrolledIds = [...new Set([...(Array.isArray(artifact.state.enrolledIds) ? (artifact.state.enrolledIds as string[]) : []), ...picked])];
      setMessage(`Enrolled ${data.enrolled ?? picked.length}.`);
      setPeopleOpen(false);
      await remember({ enrolledIds });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not enroll");
    } finally {
      setBusy(false);
    }
  }

  async function saveStep(step: Step, subject: string, body: string) {
    const res = await fetch(`/api/campaigns/${sequenceId}/steps/${step.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectTemplate: subject, bodyTemplate: body }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Could not save this step");
      return;
    }
    const nextSteps = steps.map((item) => (item.id === step.id ? { ...item, subject, body } : item));
    setSteps(nextSteps);
    onChange?.({ ...artifact, payload: { ...artifact.payload, steps: nextSteps } });
  }

  return (
    <div>
      <p className="copilot-artifact-kicker">Campaign</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <h3 className="copilot-artifact-title">{String(artifact.payload.name ?? artifact.title ?? "Sequence")}</h3>
        <span className="copilot-artifact-pill">{status}</span>
      </div>
      <p className="copilot-artifact-meta mt-1">
        {steps.length} step{steps.length === 1 ? "" : "s"} · {enrolled} enrolled
      </p>

      {expanded ? (
        <div className="mt-3">
          <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--copilot-muted)]">Leads in this campaign</p>
          {enrolledLeads.length === 0 ? (
            <p className="mt-2 text-[13px] text-[var(--copilot-muted)]">No leads enrolled yet. Add leads to name them here.</p>
          ) : (
            <ul className="mt-2">
              {enrolledLeads.map((lead) => (
                <li key={lead.id} className="copilot-lead">
                  <ContactAvatar name={lead.name} linkedinUrl={lead.linkedinUrl} email={lead.email} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="copilot-lead-name block">{lead.name || lead.email || "Lead"}</span>
                    {lead.title ? <span className="mt-0.5 block text-[12px] text-[var(--copilot-muted)]">{lead.title}</span> : null}
                    {lead.company ? (
                      <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-[var(--copilot-muted)]">
                        <CompanyFavicon domain={lead.domain || lead.company} name={lead.company} className="size-3.5" />
                        <span className="truncate">{lead.company}</span>
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : enrolledLeads.length > 0 ? (
        <p className="mt-2 text-[13px] text-[var(--copilot-muted)]">
          {enrolledLeads
            .slice(0, 3)
            .map((lead) => lead.name || lead.company)
            .filter(Boolean)
            .join(", ")}
          {enrolledLeads.length > 3 ? ` +${enrolledLeads.length - 3}` : ""}
        </p>
      ) : null}

      <ol className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.id} className="rounded-lg border border-[var(--copilot-card-border)] px-3 py-2">
            <button type="button" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => setOpenStep(openStep === step.id ? null : step.id)}>
              <span className="shrink-0 text-[14px] font-medium text-[var(--copilot-foreground)]">
                Step {step.stepOrder}
                {step.delayDays ? ` · wait ${step.delayDays}d` : ""}
              </span>
              <span className="min-w-0 text-right text-[12px] text-[var(--copilot-muted)]">
                {step.subject ? <MergeFieldPreview value={step.subject} /> : "No subject"}
              </span>
            </button>
            {openStep === step.id ? <StepEditor step={step} onSave={(subject, body) => void saveStep(step, subject, body)} /> : null}
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="copilot-artifact-btn" disabled={busy} onClick={() => void loadPeople()}>
          Add leads
        </button>
        <button type="button" className="copilot-artifact-btn" disabled={busy || status === "active"} onClick={() => void activate()}>
          Activate
        </button>
        <button type="button" className="copilot-artifact-btn copilot-artifact-btn-solid" disabled={busy} onClick={() => void runNow()}>
          Run now
        </button>
        <button type="button" className="copilot-artifact-btn" disabled={busy} onClick={() => void schedule()}>
          Schedule
        </button>
        <a className="copilot-artifact-btn" href="/dashboard/campaigns">
          Open in Campaigns
        </a>
      </div>

      {peopleOpen ? (
        <div className="mt-3 rounded-lg border border-[var(--copilot-card-border)] p-2">
          {people.length === 0 ? (
            <p className="px-1 py-2 text-[13px] text-[var(--copilot-muted)]">No contacts in Prospects yet.</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {people.map((person) => (
                <li key={person.id}>
                  <label className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-[13px] text-[var(--copilot-foreground)]">
                    <input
                      type="checkbox"
                      checked={picked.includes(person.id)}
                      onChange={() => setPicked((current) => (current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id]))}
                    />
                    <ContactAvatar name={person.fullName} linkedinUrl={person.linkedinUrl} email={person.email} className="size-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{person.fullName || "Unknown"}</span>
                      {person.company?.name ? (
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12px] text-[var(--copilot-muted)]">
                          <CompanyFavicon domain={person.company.domain || person.company.name} name={person.company.name} className="size-3.5" />
                          <span className="truncate">{person.company.name}</span>
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="copilot-artifact-btn mt-2" disabled={busy || picked.length === 0} onClick={() => void enroll()}>
            Enroll {picked.length || ""}
          </button>
        </div>
      ) : null}

      {message ? <p className="mt-2 text-[13px] text-[var(--copilot-muted)]">{message}</p> : null}
    </div>
  );
}

function StepEditor({ step, onSave }: { step: Step; onSave: (subject: string, body: string) => void }) {
  const [subject, setSubject] = useState(step.subject ?? "");
  const [body, setBody] = useState(step.body ?? "");
  return (
    <div className="mt-2 space-y-2">
      <input className="copilot-artifact-input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" />
      <textarea className="copilot-artifact-input min-h-24" value={body} onChange={(event) => setBody(event.target.value)} />
      <button type="button" className="copilot-artifact-btn" onClick={() => onSave(subject, body)}>
        Save step
      </button>
    </div>
  );
}
