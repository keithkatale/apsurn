"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { CampaignIcon } from "@/components/campaigns/CampaignIcon";
import { CompanyFavicon } from "@/components/prospects/CompanyFavicon";
import { ContactAvatar } from "@/components/prospects/ContactAvatar";
import { SequenceCanvas } from "@/components/campaigns/SequenceCanvas";
import { TrialStartModal } from "@/components/billing/TrialStartModal";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { ScanOverlay, type ScanLogEntry, type ScanState } from "@/components/progress/ScanOverlay";
import { PricingCardShell } from "@/components/ui/pricing-card-shell";
import { canvasVisibleSteps } from "@/lib/campaigns/sequence-steps";
import { cn } from "@/lib/cn";
import { htmlToPlain } from "@/lib/outreach/email-html";
import type { PlanKey } from "@/lib/billing/plans";
import { notifyCreditsChanged } from "@/components/billing/CreditsBalance";

export type CompanyProfile = {
  name: string;
  websiteUrl: string;
  summary: string;
  valueProp: string;
  positioning: string;
  personas: string[];
};

export type CampaignLead = {
  id: string;
  fullName: string | null;
  title: string | null;
  email: string | null;
  emailStatus: string;
  linkedinUrl: string | null;
  companyName: string;
  companyDomain: string;
};

export type CampaignEmailStep = {
  id: string;
  stepOrder: number;
  delayDays: number;
  subject: string | null;
  body: string;
};

export type CampaignWorkspaceItem = {
  id: string;
  name: string;
  description: string;
  pain: string;
  targeting: string[];
  estimatedVolume: number | null;
  iconSvg: string | null;
  status: string;
  contactIds: string[];
  steps: CampaignEmailStep[];
};

function formatVolume(n: number | null) {
  if (n == null) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return String(n);
}

function hostOf(url: string) {
  return url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .toLowerCase();
}

let logId = 0;
function scanning(logs: string[], progress: number): ScanState {
  logId += 1;
  return {
    phase: "scanning",
    progress,
    logs: logs.map((text) => ({ id: `campaign-${Date.now()}-${logId}`, text }) as ScanLogEntry),
  };
}

export type CampaignDraft = {
  subject: string;
  body: string;
};

function draftKey(contactId: string, sequenceId: string, stepId?: string | null) {
  return stepId ? `${contactId}:${sequenceId}:${stepId}` : `${contactId}:${sequenceId}`;
}

function lookupDraft(
  drafts: Record<string, CampaignDraft>,
  contactId: string,
  sequenceId: string,
  stepId?: string | null,
) {
  if (stepId) {
    const keyed = drafts[draftKey(contactId, sequenceId, stepId)];
    if (keyed) return keyed;
  }
  return drafts[draftKey(contactId, sequenceId)] ?? null;
}

export function CampaignWorkspace({
  profile,
  campaigns,
  leadsById,
  initialDrafts,
  senderName,
  hasBlueprint,
  inboxEmail,
}: {
  profile: CompanyProfile;
  campaigns: CampaignWorkspaceItem[];
  leadsById: Record<string, CampaignLead>;
  initialDrafts: Record<string, CampaignDraft>;
  senderName: string;
  hasBlueprint: boolean;
  inboxEmail: string | null;
}) {
  const router = useRouter();
  const [railOpen, setRailOpen] = useState(true);
  const [companyOpen, setCompanyOpen] = useState(true);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanState | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [sendAllMessage, setSendAllMessage] = useState<string | null>(null);
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [trialOpen, setTrialOpen] = useState(false);
  const [trialPlan, setTrialPlan] = useState<PlanKey>("startup");
  const [billingActive, setBillingActive] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, CampaignDraft>>(initialDrafts);
  const [generatingKeys, setGeneratingKeys] = useState<Set<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const [stepsByCampaign, setStepsByCampaign] = useState<Record<string, CampaignEmailStep[]>>(() => {
    const map: Record<string, CampaignEmailStep[]> = {};
    for (const item of campaigns) map[item.id] = canvasVisibleSteps(item.steps);
    return map;
  });
  useEffect(() => {
    setStepsByCampaign((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const item of campaigns) {
        if (!next[item.id]) {
          next[item.id] = canvasVisibleSteps(item.steps);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [campaigns]);

  const campaign = campaigns.find((item) => item.id === campaignId) ?? campaigns[0] ?? null;
  const availableLeadCount = Object.keys(leadsById).length;
  const campaignLeads = useMemo(() => {
    if (!campaign) return [];
    return campaign.contactIds.map((id) => leadsById[id]).filter(Boolean);
  }, [campaign, leadsById]);
  const lead = campaignLeads.find((item) => item.id === leadId) ?? null;
  const generating = Boolean(scan && scan.phase === "scanning");
  const campaignSteps = campaign ? (stepsByCampaign[campaign.id] ?? canvasVisibleSteps(campaign.steps)) : [];
  const domain = hostOf(profile.websiteUrl);
  const openerStepId = campaignSteps[0]?.id ?? null;
  const selectedKey = lead && campaign ? draftKey(lead.id, campaign.id, openerStepId) : null;
  const selectedDrafting = Boolean(selectedKey && generatingKeys.has(selectedKey));
  const leadIdsKey = campaignLeads.map((person) => person.id).join(",");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/billing/status");
        if (!res.ok) return;
        const data = (await res.json()) as { active?: boolean };
        if (!cancelled) setBillingActive(Boolean(data.active));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const trial = params.get("trial");
    if (trial === "startup" || trial === "growth" || trial === "pro") {
      setTrialPlan(trial);
      if (!billingActive) setTrialOpen(true);
    }

    const billing = params.get("billing");
    const subscriptionId = params.get("subscription_id");
    const email = params.get("email");
    if (billing === "success") {
      void (async () => {
        try {
          if (subscriptionId) {
            const res = await fetch("/api/billing/sync", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                subscriptionId,
                email: email || undefined,
              }),
            });
            const data = (await res.json().catch(() => null)) as { active?: boolean } | null;
            if (res.ok) {
              setBillingActive(Boolean(data?.active));
              setTrialOpen(false);
              notifyCreditsChanged(
                typeof (data as { creditBalance?: number } | null)?.creditBalance === "number"
                  ? (data as { creditBalance: number }).creditBalance
                  : undefined,
              );
              // Clean query params so refresh doesn't re-sync forever.
              const url = new URL(window.location.href);
              url.searchParams.delete("billing");
              url.searchParams.delete("subscription_id");
              url.searchParams.delete("status");
              url.searchParams.delete("email");
              window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
              return;
            }
          }
          const statusRes = await fetch("/api/billing/status");
          const status = (await statusRes.json().catch(() => null)) as { active?: boolean } | null;
          setBillingActive(Boolean(status?.active));
          if (status?.active) setTrialOpen(false);
        } catch {
          /* ignore */
        }
      })();
    }
  }, [billingActive]);

  useEffect(() => {
    if (!campaign) {
      setLeadId(null);
      return;
    }
    setLeadId((current) => {
      if (current && campaignLeads.some((person) => person.id === current)) return current;
      return campaignLeads[0]?.id ?? null;
    });
  }, [campaign, leadIdsKey, campaignLeads]);

  async function generateDraft(contactId: string, sequenceId: string, regenerate: boolean, stepId?: string | null) {
    const resolvedStepId = stepId ?? openerStepId;
    const key = draftKey(contactId, sequenceId, resolvedStepId);
    if (inFlight.current.has(key)) return;
    if (!regenerate && (draftsRef.current[key] || (!resolvedStepId && draftsRef.current[draftKey(contactId, sequenceId)]))) return;
    inFlight.current.add(key);
    setGeneratingKeys((prev) => new Set(prev).add(key));
    try {
      const res = await fetch("/api/outreach/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, campaignId: sequenceId, stepId: resolvedStepId ?? undefined, regenerate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not write this email");
      if (typeof data.creditBalance === "number") {
        notifyCreditsChanged(data.creditBalance);
      } else {
        notifyCreditsChanged();
      }
      const next = { subject: String(data.subject ?? ""), body: String(data.body ?? "") };
      const saveKey = data.stepId ? draftKey(contactId, sequenceId, data.stepId) : key;
      setDrafts((prev) => ({ ...prev, [saveKey]: next, [key]: next }));
      setLeadId((current) => {
        if (current === contactId && (!resolvedStepId || resolvedStepId === openerStepId)) {
          setSubject(next.subject);
          setBody(next.body);
          setSendMessage(null);
        }
        return current;
      });
    } catch (error) {
      setLeadId((current) => {
        if (current === contactId && (!resolvedStepId || resolvedStepId === openerStepId)) {
          setSendMessage(error instanceof Error ? error.message : "Could not write this email");
        }
        return current;
      });
    } finally {
      inFlight.current.delete(key);
      setGeneratingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  useEffect(() => {
    if (!campaign || !openerStepId) return;
    const missing = campaignLeads.filter((person) => {
      const key = draftKey(person.id, campaign.id, openerStepId);
      const legacy = draftKey(person.id, campaign.id);
      return !drafts[key] && !drafts[legacy] && !inFlight.current.has(key);
    });
    if (missing.length === 0) return;
    let cancelled = false;
    void (async () => {
      const queue = [...missing];
      async function worker() {
        while (!cancelled && queue.length > 0 && campaign) {
          const person = queue.shift();
          if (!person) break;
          await generateDraft(person.id, campaign.id, false, openerStepId);
        }
      }
      await Promise.all([worker(), worker()]);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- generate missing opener drafts when the campaign's people change
  }, [campaign?.id, leadIdsKey, openerStepId]);

  useEffect(() => {
    if (!lead || !campaign) {
      setSubject("");
      setBody("");
      return;
    }
    const cached = lookupDraft(drafts, lead.id, campaign.id, openerStepId);
    if (cached) {
      setSubject(cached.subject);
      setBody(cached.body);
    } else if (!generatingKeys.has(draftKey(lead.id, campaign.id, openerStepId))) {
      setSubject("");
      setBody("");
    }
  }, [lead?.id, campaign?.id, openerStepId]);

  useEffect(() => {
    if (!lead || !campaign || selectedDrafting) return;
    const key = draftKey(lead.id, campaign.id, openerStepId);
    const cached = lookupDraft(draftsRef.current, lead.id, campaign.id, openerStepId);
    if (!subject.trim() || !body.trim()) return;
    if (cached && cached.subject === subject && cached.body === body) return;
    const timeout = window.setTimeout(() => {
      const next = { subject, body };
      setDrafts((prev) => ({ ...prev, [key]: next }));
      void fetch("/api/outreach/draft", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: lead.id, campaignId: campaign.id, stepId: openerStepId ?? undefined, subject, body }),
      });
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [subject, body, lead?.id, campaign?.id, selectedDrafting, openerStepId]);

  async function generateFromBlueprint() {
    if (!hasBlueprint) {
      setGenerateError("Finish company setup so we have a blueprint to design from.");
      return;
    }
    setGenerateError(null);
    setScan(scanning(["Reading your company blueprint…"], 18));
    try {
      const path = campaigns.length > 0 ? "/api/onboarding/campaigns?add=1" : "/api/onboarding/campaigns";
      const res = await fetch(path, { method: "POST" });
      if (!res.ok || !res.body) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(typeof payload.error === "string" ? payload.error : "Could not create campaigns");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let count = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.split("\n").find((item) => item.startsWith("data:"));
          if (!line) continue;
          try {
            const event = JSON.parse(line.slice(5).trim()) as { type?: string; campaign?: { name?: string }; error?: string };
            if (event.type === "error") throw new Error(event.error ?? "Could not create campaigns");
            if (event.type === "campaign") {
              count += 1;
              setScan(scanning([`Saved ${event.campaign?.name ?? "campaign"}…`], Math.min(90, 20 + count * 12)));
            }
          } catch (error) {
            if (error instanceof SyntaxError) continue;
            throw error;
          }
        }
      }
      await fetch("/api/onboarding/campaigns/enroll", { method: "POST" });
      setScan(null);
      router.refresh();
    } catch (error) {
      setScan({
        phase: "error",
        progress: 100,
        logs: [],
        error: error instanceof Error ? error.message : "Could not create campaigns",
      });
    }
  }

  function rememberDraft(nextSubject: string, nextBody: string) {
    if (!lead || !campaign) return;
    const key = draftKey(lead.id, campaign.id, openerStepId);
    setDrafts((prev) => ({ ...prev, [key]: { subject: nextSubject, body: nextBody } }));
  }

  function saveStepDraft(stepId: string, nextSubject: string, nextBody: string) {
    if (!lead || !campaign) return;
    const key = draftKey(lead.id, campaign.id, stepId);
    setDrafts((prev) => ({ ...prev, [key]: { subject: nextSubject, body: nextBody } }));
    void fetch("/api/outreach/draft", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: lead.id,
        campaignId: campaign.id,
        stepId,
        subject: nextSubject,
        body: nextBody,
      }),
    });
  }

  const readyToSendCount = useMemo(() => {
    if (!campaign || !openerStepId) return 0;
    let count = 0;
    for (const person of campaignLeads) {
      if (!person.email) continue;
      const draft = lookupDraft(drafts, person.id, campaign.id, openerStepId);
      if (draft?.subject?.trim() && draft?.body?.trim()) count += 1;
    }
    return count;
  }, [campaign, campaignLeads, drafts, openerStepId]);

  async function sendEmail() {
    if (!billingActive) {
      setTrialOpen(true);
      return;
    }
    if (!lead) {
      setSendMessage("Select a person first.");
      return;
    }
    if (!lead.email) {
      setSendMessage("This contact has no email yet.");
      return;
    }
    if (!inboxEmail) {
      setSendMessage("Connect Gmail to send as you.");
      return;
    }
    if (!subject.trim() || !htmlToPlain(body)) {
      setSendMessage("Add a subject and body before sending.");
      return;
    }
    setSending(true);
    setSendMessage("Sending…");
    try {
      const res = await fetch("/api/outreach/send-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: lead.id,
          campaignId: campaign?.id,
          subject: subject.trim(),
          body: body.trim(),
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
      if (res.status === 402 || data?.code === "billing_required") {
        setTrialOpen(true);
        setSendMessage(null);
        return;
      }
      if (!res.ok) throw new Error(data?.error || `Send failed (${res.status})`);
      setSendMessage(`Sent from ${inboxEmail}`);
    } catch (error) {
      setSendMessage(error instanceof Error ? error.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function sendAllGenerated() {
    if (!billingActive) {
      setTrialOpen(true);
      return;
    }
    if (!campaign) {
      setSendAllMessage("Select a campaign first.");
      return;
    }
    if (!inboxEmail) {
      setSendAllMessage("Connect Gmail to send as you.");
      return;
    }

    const queue = campaignLeads.flatMap((person) => {
      if (!person.email) return [];
      const draft = lookupDraft(drafts, person.id, campaign.id, openerStepId);
      if (!draft?.subject?.trim() || !draft?.body?.trim()) return [];
      return [{ person, draft }];
    });

    if (queue.length === 0) {
      setSendAllMessage("Generate emails first — nothing ready to send.");
      return;
    }

    setSendingAll(true);
    setSendAllMessage(`Sending 0 of ${queue.length}…`);
    let sent = 0;
    let failed = 0;
    try {
      for (const item of queue) {
        const res = await fetch("/api/outreach/send-now", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactId: item.person.id,
            campaignId: campaign.id,
            subject: item.draft.subject.trim(),
            body: item.draft.body.trim(),
          }),
        });
        const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
        if (res.status === 402 || data?.code === "billing_required") {
          setTrialOpen(true);
          setSendAllMessage(sent > 0 ? `Sent ${sent}, then billing required` : null);
          return;
        }
        if (!res.ok) {
          failed += 1;
        } else {
          sent += 1;
        }
        setSendAllMessage(`Sending ${sent + failed} of ${queue.length}…`);
      }
      setSendAllMessage(
        failed > 0 ? `Sent ${sent} · ${failed} failed` : `Sent ${sent} email${sent === 1 ? "" : "s"}`,
      );
    } catch (error) {
      setSendAllMessage(error instanceof Error ? error.message : "Send all failed");
    } finally {
      setSendingAll(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-[#EEEEEE] bg-neutral-50 transition-[width] duration-200",
          railOpen ? "w-[340px]" : "w-12",
        )}
      >
        {!railOpen && (
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            aria-label="Expand sidebar"
            className="m-2 inline-flex size-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-white hover:text-neutral-800"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        )}

        {railOpen && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <section className="shrink-0 p-3">
              <PricingCardShell className="h-auto p-2" innerClassName="gap-2 p-3 sm:p-3">
                <div className="flex items-start gap-2.5">
                  <CompanyFavicon domain={domain} name={profile.name} className="mt-0.5 size-8 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4379EE]">Company blueprint</p>
                    <h3 className="mt-0.5 font-heading text-[16px] font-semibold leading-snug tracking-[-0.04em] text-black">
                      {profile.name}
                    </h3>
                    {domain ? <p className="text-[12px] text-neutral-400">{domain}</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRailOpen(false)}
                    aria-label="Collapse sidebar"
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700"
                  >
                    <PanelLeftClose className="size-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setCompanyOpen((open) => !open)}
                  className="flex w-full items-center justify-between text-left text-[11px] font-medium text-neutral-500"
                >
                  {companyOpen ? "Hide details" : "Show details"}
                  <ChevronDown className={cn("size-3.5 transition-transform", !companyOpen && "-rotate-90")} />
                </button>
                {companyOpen && (
                  <>
                    <p className="text-[13px] leading-snug tracking-[-0.03em] text-[#605f5f]">{profile.summary}</p>
                    {profile.valueProp && profile.valueProp !== profile.summary && (
                      <p className="text-[13px] leading-snug text-[#605f5f]">{profile.valueProp}</p>
                    )}
                    {profile.personas.length > 0 && (
                      <p className="text-[12px] text-neutral-600">
                        <span className="font-medium text-neutral-700">Personas: </span>
                        {profile.personas.join(" · ")}
                      </p>
                    )}
                  </>
                )}
              </PricingCardShell>
            </section>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center justify-between px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  Campaigns {campaigns.length ? `· ${campaigns.length}` : ""}
                </p>
                <button
                  type="button"
                  onClick={() => setNewCampaignOpen(true)}
                  className="text-[11px] font-semibold text-[#4379EE] hover:text-[#3567D6]"
                >
                  New
                </button>
              </div>
              <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {campaigns.length === 0 ? (
                  <p className="px-2 py-4 text-[12px] text-neutral-500">No campaigns yet. Create one to start outreach.</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {campaigns.map((item) => {
                      const selected = item.id === campaign?.id;
                      const volume = formatVolume(item.estimatedVolume);
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setCampaignId(item.id)}
                            className={cn(
                              "flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2.5 text-left",
                              selected ? "border-[#4379EE] bg-[#E8F1FC]" : "border-transparent hover:bg-white",
                            )}
                          >
                            <CampaignIcon
                              campaign={item}
                              storedSvg={item.iconSvg}
                              selected={selected}
                              className="mt-0.5 size-8"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-start justify-between gap-2">
                                <span className={cn("text-[13px] leading-snug", selected ? "font-semibold text-[#4379EE]" : "font-semibold text-neutral-800")}>
                                  {item.name}
                                </span>
                                <span className="shrink-0 text-[12px] text-neutral-400">
                                  {volume ?? item.contactIds.length}
                                </span>
                              </span>
                              {(item.description || item.pain) && (
                                <span className="mt-1 line-clamp-2 text-[12px] leading-snug text-neutral-500">
                                  {item.description || item.pain}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </nav>
            </div>
          </div>
        )}
      </aside>

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {generateError && !scan && (
          <p className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{generateError}</p>
        )}

        {campaigns.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-base font-semibold text-neutral-900">Create a campaign to start outreach</p>
            <p className="max-w-sm text-sm text-neutral-500">
              Campaigns group people and the emails you send them. Leads stay in Prospects until you put them in a campaign.
            </p>
            <ThreeDButton type="button" variant="solid" size="sm" disabled={generating} onClick={() => setNewCampaignOpen(true)}>
              Create new campaign
            </ThreeDButton>
          </div>
        ) : (
          <>
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#EEEEEE] px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                {campaign && (
                  <CampaignIcon campaign={campaign} storedSvg={campaign.iconSvg} selected className="size-9" />
                )}
                <div className="min-w-0">
                  <h1 className="truncate text-[15px] font-semibold text-neutral-900">{campaign?.name ?? "Campaign"}</h1>
                  <p className="truncate text-[12px] text-neutral-500">
                    {campaign?.description || campaign?.pain || "Pick a person to write this campaign’s email."}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <ThreeDButton
                    type="button"
                    variant="solid"
                    size="sm"
                    className="send-attention-pulse"
                    disabled={sendingAll || generating}
                    onClick={() => void sendAllGenerated()}
                  >
                    {sendingAll ? (
                      "Sending all…"
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        Send all now
                        {readyToSendCount > 0 ? (
                          <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                            {readyToSendCount}
                          </span>
                        ) : null}
                        <span className="material-symbols-outlined text-[16px] leading-none" aria-hidden>
                          send
                        </span>
                      </span>
                    )}
                  </ThreeDButton>
                  <ThreeDButton type="button" variant="soft" size="sm" disabled={generating} onClick={() => setNewCampaignOpen(true)}>
                    New campaign
                  </ThreeDButton>
                </div>
                {sendAllMessage && (
                  <p
                    className={cn(
                      "max-w-xs text-right text-[11px]",
                      /fail|error|required|nothing|Connect/i.test(sendAllMessage)
                        ? "text-red-600"
                        : sendAllMessage.startsWith("Sent")
                          ? "text-emerald-600"
                          : "text-neutral-500",
                    )}
                  >
                    {sendAllMessage}
                  </p>
                )}
              </div>
            </header>

            <div className="campaign-canvas relative flex min-h-0 flex-1 gap-4 overflow-hidden p-6">
              <section className="relative z-10 flex h-full min-h-0 w-[320px] shrink-0 flex-col overflow-hidden rounded-lg border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <div className="shrink-0 border-b border-neutral-100 px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4379EE]">People</p>
                  <p className="text-[12px] text-neutral-500">{campaignLeads.length} in this campaign</p>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                  {campaignLeads.length === 0 && (
                    <li className="px-2 py-6 text-center text-[12px] text-neutral-500">
                      No people in this campaign yet.
                    </li>
                  )}
                  {campaignLeads.map((person) => {
                    const selected = person.id === lead?.id;
                    const key = campaign ? draftKey(person.id, campaign.id, openerStepId) : "";
                    const ready = Boolean(lookupDraft(drafts, person.id, campaign?.id ?? "", openerStepId));
                    const writing = generatingKeys.has(key) || generatingKeys.has(draftKey(person.id, campaign?.id ?? ""));
                    return (
                      <li key={person.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (selected && campaign) {
                              void generateDraft(person.id, campaign.id, true, openerStepId);
                              return;
                            }
                            setLeadId(person.id);
                          }}
                          className={cn(
                            "mb-1 flex w-full items-start gap-2.5 rounded-lg px-2.5 py-3 text-left",
                            selected ? "bg-[#E8F1FC]" : "hover:bg-neutral-50",
                          )}
                        >
                          <ContactAvatar name={person.fullName} linkedinUrl={person.linkedinUrl} email={person.email} className="mt-0.5 size-9" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className="line-clamp-2 text-[13px] font-medium leading-snug text-neutral-900">
                                {person.fullName || "Unknown"}
                              </span>
                              {writing ? (
                                <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-[#4379EE]" />
                              ) : ready ? (
                                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                              ) : null}
                            </span>
                            <span className="mt-1 line-clamp-2 text-[12px] leading-snug text-neutral-500">
                              {person.title || "Role unknown"}
                            </span>
                            <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-neutral-500">
                              <CompanyFavicon domain={person.companyDomain} name={person.companyName} className="size-3.5" />
                              <span className="line-clamp-2">{person.companyName || person.companyDomain}</span>
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>

              <section className="relative z-10 min-h-0 min-w-0 flex-1 overflow-hidden">
                {campaign && (
                  <SequenceCanvas
                    campaignId={campaign.id}
                    steps={campaignSteps}
                    onStepsChange={(next) => setStepsByCampaign((prev) => ({ ...prev, [campaign.id]: next }))}
                    lead={lead}
                    drafts={drafts}
                    generatingKeys={generatingKeys}
                    onGenerateStep={(stepId, regenerate) => {
                      if (lead && campaign) void generateDraft(lead.id, campaign.id, regenerate, stepId);
                    }}
                    onSaveStepDraft={saveStepDraft}
                    senderName={senderName}
                    inboxEmail={inboxEmail}
                    subject={subject}
                    body={body}
                    onSubjectChange={(value) => {
                      setSubject(value);
                      rememberDraft(value, body);
                    }}
                    onBodyChange={(html) => {
                      setBody(html);
                      rememberDraft(subject, html);
                    }}
                    drafting={selectedDrafting}
                    onRegenerateOpener={() => {
                      if (lead && campaign) void generateDraft(lead.id, campaign.id, true, openerStepId);
                    }}
                    sending={sending}
                    sendMessage={sendMessage}
                    onSend={() => void sendEmail()}
                    billingActive={billingActive}
                    onStartTrial={() => setTrialOpen(true)}
                  />
                )}
              </section>
            </div>
          </>
        )}

        {scan && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 px-4">
            <div className="w-[22rem] shrink-0">
              <ScanOverlay
                compact
                state={scan}
                kicker="Campaigns"
                title="Designing campaigns"
                runningLabel="Saving"
                onRetry={() => void generateFromBlueprint()}
              />
            </div>
          </div>
        )}
      </div>

      {trialOpen && (
        <TrialStartModal open={trialOpen} onClose={() => setTrialOpen(false)} defaultPlan={trialPlan} />
      )}

      {newCampaignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setNewCampaignOpen(false)}>
          <div
            className="w-full max-w-md rounded-2xl border border-[#EEEEEE] bg-white p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-neutral-900">New campaign</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Use the leads you already have, or find new accounts first. We will not scrape again unless you ask.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={availableLeadCount === 0 || generating}
                onClick={() => {
                  setNewCampaignOpen(false);
                  void generateFromBlueprint();
                }}
                className="rounded-lg border border-[#EEEEEE] px-4 py-3 text-left hover:border-[#4379EE] hover:bg-[#E8F1FC] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <p className="text-sm font-semibold text-neutral-900">Use available leads</p>
                <p className="mt-0.5 text-[12px] text-neutral-500">
                  {availableLeadCount === 0
                    ? "No leads yet. Find accounts first."
                    : `Create a campaign for ${availableLeadCount} existing lead${availableLeadCount === 1 ? "" : "s"}.`}
                </p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewCampaignOpen(false);
                  router.push("/dashboard/prospects?find=1");
                }}
                className="rounded-lg border border-[#EEEEEE] px-4 py-3 text-left hover:border-[#4379EE] hover:bg-[#E8F1FC]"
              >
                <p className="text-sm font-semibold text-neutral-900">Find new leads</p>
                <p className="mt-0.5 text-[12px] text-neutral-500">Open prospecting to scrape new accounts, then come back here.</p>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setNewCampaignOpen(false)}
              className="mt-4 text-sm font-medium text-neutral-500 hover:text-neutral-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
