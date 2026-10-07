"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Search, Upload } from "lucide-react";
import { CampaignIcon } from "@/components/campaigns/CampaignIcon";
import { CsvImportProgress, rememberProgressLog } from "@/components/campaigns/CsvImportProgress";
import { NewCampaignDialog, type CsvProgressUpdate } from "@/components/campaigns/NewCampaignDialog";
import { useCampaignNav } from "@/components/campaigns/CampaignsNav";
import { CompanyFavicon } from "@/components/prospects/CompanyFavicon";
import { ContactAvatar } from "@/components/prospects/ContactAvatar";
import { SequenceCanvas } from "@/components/campaigns/SequenceCanvas";
import { TrialStartModal } from "@/components/billing/TrialStartModal";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { ScanOverlay, type ScanLogEntry, type ScanState } from "@/components/progress/ScanOverlay";
import { canvasVisibleSteps } from "@/lib/campaigns/sequence-steps";
import { cn } from "@/lib/cn";
import { htmlToPlain } from "@/lib/outreach/email-html";
import { tokenizeLeadMentions } from "@/lib/outreach/merge-fields";
import type { PlanKey } from "@/lib/billing/plans";
import { notifyCreditsChanged } from "@/components/billing/CreditsBalance";
import { goToAccount } from "@/lib/auth/require-account-client";
import { readSse } from "@/lib/http/read-sse";

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
  campaigns,
  leadsById,
  initialDrafts,
  senderName,
  hasBlueprint,
  inboxEmail,
  initialCampaignId,
}: {
  profile: CompanyProfile;
  campaigns: CampaignWorkspaceItem[];
  leadsById: Record<string, CampaignLead>;
  initialDrafts: Record<string, CampaignDraft>;
  senderName: string;
  hasBlueprint: boolean;
  inboxEmail: string | null;
  initialCampaignId?: string;
}) {
  const router = useRouter();
  const nav = useCampaignNav();
  const [leadId, setLeadId] = useState<string | null>(null);
  const leadIdRef = useRef<string | null>(null);
  leadIdRef.current = leadId;
  /** The lead whose own email is currently in the editor. Edits are saved to that lead only. */
  const editorOwnerRef = useRef<string | null>(null);
  const [scan, setScan] = useState<ScanState | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [sendMessage, setSendMessage] = useState<string | null>(null);
  const [sendAllMessage, setSendAllMessage] = useState<string | null>(null);
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [items, setItems] = useState(campaigns);
  const [leadMap, setLeadMap] = useState(leadsById);
  const [addOpen, setAddOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setItems(campaigns);
  }, [campaigns]);
  useEffect(() => {
    nav.sync(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        icon: item.iconSvg ?? "",
        description: item.description || item.pain,
      })),
    );
  }, [items, nav.sync]);
  useEffect(() => {
    const ids = new Set(items.map((item) => item.id));
    if (nav.activeId && ids.has(nav.activeId)) return;
    const fallback = items.find((item) => item.id === initialCampaignId)?.id ?? items[0]?.id ?? null;
    if (fallback !== nav.activeId) nav.select(fallback);
  }, [items, initialCampaignId, nav.activeId, nav.select]);
  useEffect(() => {
    setLeadMap((current) => ({ ...current, ...leadsById }));
  }, [leadsById]);
  const [trialOpen, setTrialOpen] = useState(false);
  const [trialPlan, setTrialPlan] = useState<PlanKey>("startup");
  const [billingActive, setBillingActive] = useState(false);
  const [guestAccount, setGuestAccount] = useState(false);
  const [sessionKnown, setSessionKnown] = useState(false);
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

  const campaignId =
    nav.activeId && items.some((item) => item.id === nav.activeId)
      ? nav.activeId
      : (items.find((item) => item.id === initialCampaignId)?.id ?? items[0]?.id ?? "");
  const campaign = items.find((item) => item.id === campaignId) ?? null;
  const availableLeadCount = Object.keys(leadMap).length;
  const campaignLeads = useMemo(() => {
    if (!campaign) return [];
    return campaign.contactIds.map((id) => leadMap[id]).filter(Boolean);
  }, [campaign, leadMap]);
  const lead = campaignLeads.find((item) => item.id === leadId) ?? null;
  const generating = Boolean(scan && scan.phase === "scanning");
  const campaignSteps = campaign ? (stepsByCampaign[campaign.id] ?? canvasVisibleSteps(campaign.steps)) : [];
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
        const session = await fetch("/api/auth/session");
        const who = (await session.json().catch(() => null)) as { guest?: boolean } | null;
        if (!cancelled) {
          setGuestAccount(Boolean(who?.guest));
          setSessionKnown(true);
        }
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
    if (sessionKnown && (trial === "startup" || trial === "growth")) {
      setTrialPlan(trial);
      if (!billingActive) {
        if (guestAccount) askForAccount();
        else setTrialOpen(true);
      }
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
  }, [billingActive, guestAccount, sessionKnown]);

  useEffect(() => {
    if (!campaign) {
      setLeadId(null);
      return;
    }
    setLeadId((current) => {
      if (current && campaignLeads.some((person) => person.id === current)) return current;
      // Every email is one lead's own: open the first lead so the editor always shows a real person's email.
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
      const person = leadMap[contactId];
      const next = {
        subject: tokenizeLeadMentions(String(data.subject ?? ""), person),
        body: tokenizeLeadMentions(htmlToPlain(String(data.body ?? "")), person),
      };
      const saveKey = data.stepId ? draftKey(contactId, sequenceId, data.stepId) : key;
      setDrafts((prev) => ({ ...prev, [saveKey]: next, [key]: next }));
      const targetStepId = (typeof data.stepId === "string" ? data.stepId : resolvedStepId) ?? openerStepId;
      if (targetStepId && targetStepId !== openerStepId) {
        setStepsByCampaign((prev) => ({
          ...prev,
          [sequenceId]: (prev[sequenceId] ?? []).map((step) =>
            step.id === targetStepId ? { ...step, subject: next.subject, body: next.body } : step,
          ),
        }));
        // Shown for the selected lead only: one lead's email must never overwrite the campaign step for everyone.
      } else if (leadIdRef.current === contactId) {
        editorOwnerRef.current = contactId;
        setSubject(next.subject);
        setBody(next.body);
        setSendMessage(null);
      }
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

  // Show the selected lead's own email: their saved draft, or one written now from what we know about them.
  useEffect(() => {
    if (!campaign || !openerStepId || !lead) {
      editorOwnerRef.current = null;
      setSubject("");
      setBody("");
      return;
    }
    const cached = draftsRef.current[draftKey(lead.id, campaign.id, openerStepId)];
    if (cached) {
      editorOwnerRef.current = lead.id;
      setSubject(cached.subject);
      setBody(cached.body);
      return;
    }
    editorOwnerRef.current = null;
    setSubject("");
    setBody("");
    void generateDraft(lead.id, campaign.id, false, openerStepId);
    // generateDraft is recreated every render; the lead and step are what trigger a load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id, campaign?.id, openerStepId]);

  // Edits are saved to the selected lead's own email, never to a campaign-wide template.
  useEffect(() => {
    if (!campaign || !openerStepId || !lead || editorOwnerRef.current !== lead.id) return;
    const key = draftKey(lead.id, campaign.id, openerStepId);
    const saved = draftsRef.current[key];
    if (!saved || (subject === saved.subject && body === saved.body)) return;
    const timeout = window.setTimeout(() => {
      setDrafts((prev) => ({ ...prev, [key]: { subject, body } }));
      void fetch("/api/outreach/draft", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: lead.id, campaignId: campaign.id, stepId: openerStepId, subject, body }),
      });
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [subject, body, campaign, openerStepId, lead]);

  async function generateFromBlueprint() {
    if (!hasBlueprint) {
      setGenerateError("Finish company setup so we have a blueprint to design from.");
      return;
    }
    setGenerateError(null);
    setScan(scanning(["Reading your company blueprint…"], 18));
    try {
      const path = items.length > 0 ? "/api/onboarding/campaigns?add=1" : "/api/onboarding/campaigns";
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

  function saveStepDraft(stepId: string, nextSubject: string, nextBody: string) {
    if (!campaign) return;
    if (stepId === openerStepId) {
      setSubject(nextSubject);
      setBody(nextBody);
      return;
    }
    setStepsByCampaign((prev) => ({
      ...prev,
      [campaign.id]: (prev[campaign.id] ?? []).map((step) =>
        step.id === stepId ? { ...step, subject: nextSubject, body: nextBody } : step,
      ),
    }));
    // A follow-up edit belongs to the selected lead's own email, not the step shared by the whole campaign.
    if (!lead) return;
    void fetch("/api/outreach/draft", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: lead.id, campaignId: campaign.id, stepId, subject: nextSubject, body: nextBody }),
    });
  }

  // Every lead gets their own email written on demand, so only an address is needed to send.
  const openerTemplateReady = true;
  const readyToSendCount = useMemo(() => {
    if (!openerTemplateReady) return 0;
    return campaignLeads.filter((person) => person.email).length;
  }, [campaignLeads, openerTemplateReady]);

  function askForAccount() {
    goToAccount();
  }

  function openCredits() {
    if (guestAccount) {
      goToAccount();
      return;
    }
    setTrialOpen(true);
  }

  async function sendEmail() {
    if (guestAccount) {
      askForAccount();
      return;
    }
    if (!billingActive) {
      openCredits();
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
      if (data?.code === "account_required") {
        askForAccount();
        setSendMessage(null);
        return;
      }
      if (res.status === 402 || data?.code === "billing_required") {
        openCredits();
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
    if (guestAccount) {
      askForAccount();
      return;
    }
    if (!billingActive) {
      openCredits();
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

    const queue = campaignLeads.flatMap((person) => (person.email ? [{ person }] : []));

    if (queue.length === 0) {
      setSendAllMessage("Add contacts with an email before sending.");
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
          // No subject/body: the server sends each lead their own email, written from what we know about them.
          body: JSON.stringify({ contactId: item.person.id, campaignId: campaign.id }),
        });
        const data = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
        if (data?.code === "account_required") {
          askForAccount();
          setSendAllMessage(null);
          return;
        }
        if (res.status === 402 || data?.code === "billing_required") {
          openCredits();
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

  const availableContacts = Object.values(leadMap).filter((person) => !campaign?.contactIds.includes(person.id));
  const filteredContacts = useMemo(() => {
    const query = contactQuery.trim().toLowerCase();
    if (!query) return availableContacts;
    return availableContacts.filter((person) =>
      [person.fullName, person.email, person.title, person.companyName, person.companyDomain].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [availableContacts, contactQuery]);

  async function enrollIds(sequenceId: string, contactIds: string[]) {
    let enrolled = 0;
    let missingEmail = 0;
    for (let index = 0; index < contactIds.length; index += 400) {
      const res = await fetch(`/api/sequences/${sequenceId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: contactIds.slice(index, index + 400) }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; enrolled?: number; missingEmail?: number } | null;
      if (!res.ok) throw new Error(data?.error || "Could not add contacts");
      enrolled += data?.enrolled ?? 0;
      missingEmail += data?.missingEmail ?? 0;
    }
    return { enrolled, missingEmail };
  }

  function rememberEnrolled(sequenceId: string, people: CampaignLead[]) {
    if (people.length === 0) return;
    setLeadMap((prev) => {
      const next = { ...prev };
      for (const person of people) next[person.id] = person;
      return next;
    });
    setItems((prev) =>
      prev.map((item) =>
        item.id === sequenceId
          ? { ...item, contactIds: [...item.contactIds, ...people.map((person) => person.id).filter((id) => !item.contactIds.includes(id))] }
          : item,
      ),
    );
    setLeadId(people[0]?.id ?? null);
  }

  async function saveCampaignName(id: string, nextName: string) {
    const name = nextName.trim();
    if (!name) return;
    const current = items.find((item) => item.id === id);
    if (!current || current.name === name) return;
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, name } : item)));
    const res = await fetch(`/api/sequences/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, name: current.name } : item)));
      return;
    }
    router.refresh();
  }

  async function deleteCampaign(id: string) {
    const res = await fetch(`/api/sequences/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    const remaining = items.filter((item) => item.id !== id);
    setItems(remaining);
    if (campaignId === id) nav.select(remaining[0]?.id ?? null);
    router.refresh();
  }

  useEffect(() => {
    nav.bind({
      create: () => setNewCampaignOpen(true),
      rename: (id, name) => {
        void saveCampaignName(id, name);
      },
      remove: (id) => {
        void deleteCampaign(id);
      },
    });
  });

  async function addPickedContacts() {
    if (!campaign || pickedIds.size === 0) return;
    setAddBusy(true);
    setAddError(null);
    try {
      const ids = [...pickedIds];
      const data = await enrollIds(campaign.id, ids);
      if (!data.enrolled) {
        throw new Error(
          data.missingEmail
            ? "Those contacts need an email before they can be added."
            : "Could not add those contacts to this campaign.",
        );
      }
      rememberEnrolled(
        campaign.id,
        ids.map((id) => leadMap[id]).filter(Boolean),
      );
      setPickedIds(new Set());
      setAddOpen(false);
      router.refresh();
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "Could not add contacts");
    } finally {
      setAddBusy(false);
    }
  }

  function noteImport(label: string, progress: number) {
    setImportStatus(label);
    setImportProgress((current) => Math.max(current, progress));
    setImportLogs((prev) => rememberProgressLog(prev, label));
  }

  async function importCsvFile(file: File) {
    setImportBusy(true);
    setImportError(null);
    setImportProgress(4);
    setImportLogs(["Reading the file…"]);
    setImportStatus("Reading the file…");
    try {
      const body = new FormData();
      body.append("file", file);
      if (campaign) body.append("sequenceId", campaign.id);
      const res = await fetch("/api/prospects/import", { method: "POST", body });
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json") || !res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Import failed");
      }
      let finalMessage: string | null = null;
      let importedIds: string[] = [];
      let importedLeads: CampaignLead[] = [];
      await readSse(res.body, (event) => {
        if (event.type === "error") throw new Error(typeof event.error === "string" ? event.error : "Import failed");
        if (typeof event.label === "string") noteImport(event.label, typeof event.progress === "number" ? event.progress : 0);
        if (event.type === "result") {
          importedIds = Array.isArray(event.contactIds) ? event.contactIds.filter((id: unknown) => typeof id === "string") : [];
          importedLeads = Array.isArray(event.leads) ? (event.leads as CampaignLead[]) : [];
          const enrolled = Number(event.enrolled ?? 0);
          const skipped = Number(event.skipped ?? 0);
          finalMessage = enrolled
            ? `Added ${enrolled} lead${enrolled === 1 ? "" : "s"} to this campaign.`
            : `Saved ${importedIds.length} contact${importedIds.length === 1 ? "" : "s"}${skipped ? ` — ${skipped} row${skipped === 1 ? "" : "s"} skipped` : ""}.`;
          noteImport(finalMessage, 100);
        }
      });
      if (importedLeads.length > 0) {
        setLeadMap((prev) => {
          const next = { ...prev };
          for (const person of importedLeads) next[person.id] = person;
          return next;
        });
      }
      if (campaign && importedIds.length > 0) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === campaign.id
              ? { ...item, contactIds: [...new Set([...item.contactIds, ...importedIds])] }
              : item,
          ),
        );
      }
      setImportStatus(finalMessage);
      router.refresh();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed");
      setImportStatus(null);
    } finally {
      setImportBusy(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  }

  async function createManualCampaign(
    input: { name: string; about: string; file: File },
    report: (update: CsvProgressUpdate) => void,
  ) {
    const body = new FormData();
    body.set("name", input.name);
    body.set("about", input.about);
    body.set("file", input.file);
    report({ label: "Uploading the file…", progress: 2 });
    const res = await fetch("/api/campaigns/manual", { method: "POST", body });
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const failed = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(failed?.error || "Could not create that campaign");
    }
    if (!res.body) throw new Error("Could not create that campaign");
    type ManualCampaignResult = {
      sequenceId?: string;
      name?: string;
      description?: string;
      iconSvg?: string;
      contactIds?: string[];
      leads?: CampaignLead[];
      steps?: CampaignEmailStep[];
    };
    const outcome: { data: ManualCampaignResult | null; error: string | null } = { data: null, error: null };
    await readSse(res.body, (event) => {
      if (event.type === "error") {
        outcome.error = typeof event.error === "string" ? event.error : "Could not create that campaign";
        return;
      }
      if (event.type === "result") {
        outcome.data = event as ManualCampaignResult;
        report({ label: "Campaign ready.", progress: 100 });
        return;
      }
      if (typeof event.label === "string") {
        report({ label: event.label, progress: typeof event.progress === "number" ? event.progress : 0 });
      }
    });
    if (outcome.error) throw new Error(outcome.error);
    const created = outcome.data;
    if (!created?.sequenceId) throw new Error("Could not create that campaign");
    const sequenceId = created.sequenceId;
    const leads = created.leads ?? [];
    setLeadMap((prev) => {
      const next = { ...prev };
      for (const person of leads) next[person.id] = person;
      return next;
    });
    setItems((prev) => [
      {
        id: sequenceId,
        name: created.name || input.name,
        description: created.description || input.about,
        pain: input.about,
        targeting: [],
        estimatedVolume: created.contactIds?.length ?? leads.length,
        iconSvg: created.iconSvg ?? null,
        status: "draft",
        contactIds: created.contactIds ?? leads.map((person) => person.id),
        steps: created.steps ?? [],
      },
      ...prev.filter((item) => item.id !== sequenceId),
    ]);
    setStepsByCampaign((prev) => ({ ...prev, [sequenceId]: created.steps ?? [] }));
    nav.select(sequenceId);
    setNewCampaignOpen(false);
    router.refresh();
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-white">

      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {generateError && !scan && (
          <p className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{generateError}</p>
        )}

        {items.length === 0 ? (
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
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#EEEEEE] px-3 py-2.5 sm:px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                {campaign && (
                  <CampaignIcon campaign={campaign} storedSvg={campaign.iconSvg} selected className="size-9" />
                )}
                <div className="min-w-0">
                  <h1 className="truncate text-[15px] font-semibold text-neutral-900">{campaign?.name ?? "Campaign"}</h1>
                  <p className="truncate text-[12px] text-neutral-500">
                    {campaign?.description || campaign?.pain || "One message for everyone. Fields fill in per lead."}
                  </p>
                </div>
              </div>
              <div className="flex w-full shrink-0 flex-col items-stretch gap-1 sm:w-auto sm:items-end">
                <div className="flex flex-wrap items-center justify-end gap-2">
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
                      /fail|error|required|nothing|Connect|Write the campaign/i.test(sendAllMessage)
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

            <div className="campaign-canvas relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 md:flex-row md:gap-3 md:overflow-hidden md:p-3">
              {importBusy && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-[color-mix(in_srgb,var(--background)_82%,transparent)] px-4 backdrop-blur-[2px]">
                  <CsvImportProgress progress={importProgress} label={importStatus ?? "Reading the file…"} logs={importLogs} />
                </div>
              )}
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importCsvFile(file);
                }}
              />
              <section className="relative z-10 flex max-h-72 min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-lg border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] md:h-full md:max-h-none md:w-[320px]">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2.5">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4379EE]">People</p>
                    <p className="text-[12px] text-neutral-500">{campaignLeads.length} in this campaign</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAddError(null);
                      setPickedIds(new Set());
                      setContactQuery("");
                      setAddOpen(true);
                    }}
                    className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-[#E8F1FC] hover:text-[#4379EE]"
                  >
                    Add
                  </button>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto p-2">
                  {campaignLeads.length === 0 && (
                    <li className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                      <p className="text-[12px] text-neutral-500">No people in this campaign yet.</p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <ThreeDButton
                          type="button"
                          variant="solid"
                          size="sm"
                          onClick={() => {
                            setAddError(null);
                            setPickedIds(new Set());
                            setAddOpen(true);
                          }}
                        >
                          Add contacts
                        </ThreeDButton>
                        <ThreeDButton type="button" variant="soft" size="sm" disabled={importBusy} onClick={() => csvInputRef.current?.click()}>
                          {importBusy ? "Uploading…" : "Upload CSV"}
                        </ThreeDButton>
                      </div>
                      {(importStatus || importError) && (
                        <p className={cn("max-w-[220px] text-[11px]", importError ? "text-red-600" : "text-neutral-500")}>
                          {importError || importStatus}
                        </p>
                      )}
                    </li>
                  )}
                  {campaignLeads.map((person) => {
                    const selected = person.id === lead?.id;
                    const key = campaign ? draftKey(person.id, campaign.id, openerStepId) : "";
                    const ready = openerTemplateReady && Boolean(person.email);
                    const writing = generatingKeys.has(key) || generatingKeys.has(draftKey(person.id, campaign?.id ?? ""));
                    return (
                      <li key={person.id}>
                        <button
                          type="button"
                          onClick={() => setLeadId(selected ? null : person.id)}
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

              <section className="relative z-10 min-h-[70vh] min-w-0 flex-1 overflow-hidden md:min-h-0">
                {campaign && addOpen ? (
                  <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[#EEEEEE] bg-white">
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-100 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-neutral-900">Add contacts</p>
                        <p className="truncate text-[12px] text-neutral-500">Select people, or upload a CSV.</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          disabled={importBusy}
                          onClick={() => csvInputRef.current?.click()}
                          className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-[#E8F1FC] hover:text-[#4379EE] disabled:opacity-50"
                        >
                          <Upload className="size-3" />
                          {importBusy ? "Uploading…" : "Upload CSV"}
                        </button>
                        <button
                          type="button"
                          disabled={addBusy || pickedIds.size === 0}
                          onClick={() => void addPickedContacts()}
                          className="rounded-full bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-500"
                        >
                          {addBusy ? "Adding…" : `Add${pickedIds.size ? ` ${pickedIds.size}` : ""}`}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddOpen(false)}
                          className="text-[12px] font-semibold text-neutral-500 hover:text-neutral-800"
                        >
                          Back to sequence
                        </button>
                      </div>
                    </div>
                    <ul className="min-h-0 flex-1 overflow-y-auto px-1 py-1">
                      {filteredContacts.length === 0 ? (
                        <li className="px-3 py-10 text-center text-[13px] text-neutral-500">
                          {availableContacts.length === 0
                            ? "No other contacts yet. Upload a CSV to add people to this campaign."
                            : "No contacts match that search."}
                        </li>
                      ) : (
                        filteredContacts.map((person) => {
                          const checked = pickedIds.has(person.id);
                          const blocked = !person.email;
                          return (
                            <li key={person.id}>
                              <label
                                className={cn(
                                  "flex items-center gap-3 rounded-lg px-2 py-2",
                                  blocked ? "opacity-50" : "cursor-pointer hover:bg-neutral-50",
                                )}
                              >
                                <input
                                  type="checkbox"
                                  disabled={blocked || addBusy}
                                  checked={checked}
                                  onChange={() => {
                                    setPickedIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(person.id)) next.delete(person.id);
                                      else next.add(person.id);
                                      return next;
                                    });
                                  }}
                                />
                                <ContactAvatar
                                  name={person.fullName}
                                  linkedinUrl={person.linkedinUrl}
                                  email={person.email}
                                  className="size-9"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-medium text-neutral-900">
                                    {person.fullName || "Unknown"}
                                  </span>
                                  <span className="block truncate text-[12px] text-neutral-500">
                                    {person.title || "Role unknown"}
                                    {person.companyName ? ` · ${person.companyName}` : ""}
                                    {" · "}
                                    {person.email || "No email"}
                                  </span>
                                </span>
                              </label>
                            </li>
                          );
                        })
                      )}
                      {(importStatus || importError || addError) && (
                        <li className="px-2 py-1">
                          <p className={cn("text-[12px]", importError || addError ? "text-red-600" : "text-neutral-500")}>
                            {importError || addError || importStatus}
                          </p>
                        </li>
                      )}
                    </ul>
                    <div className="flex shrink-0 items-center border-t border-neutral-100 px-2 py-1.5">
                      <label className="relative w-full max-w-[260px]">
                        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
                        <input
                          value={contactQuery}
                          onChange={(event) => setContactQuery(event.target.value)}
                          placeholder="Search name, company, or email"
                          aria-label="Search contacts"
                          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-1.5 pl-7 pr-2 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-[#4379EE]"
                        />
                      </label>
                    </div>
                  </div>
                ) : campaign ? (
                  <SequenceCanvas
                    campaignId={campaign.id}
                    steps={campaignSteps}
                    onStepsChange={(next) => setStepsByCampaign((prev) => ({ ...prev, [campaign.id]: next }))}
                    lead={lead}
                    generatingKeys={generatingKeys}
                    onGenerateStep={(stepId, regenerate) => {
                      if (lead && campaign) void generateDraft(lead.id, campaign.id, regenerate, stepId);
                    }}
                    onSaveStepDraft={saveStepDraft}
                    senderName={senderName}
                    inboxEmail={inboxEmail}
                    subject={subject}
                    body={body}
                    onSubjectChange={setSubject}
                    onBodyChange={setBody}
                    drafting={selectedDrafting}
                    onRegenerateOpener={() => {
                      if (lead && campaign) void generateDraft(lead.id, campaign.id, true, openerStepId);
                    }}
                    sending={sending}
                    sendMessage={sendMessage}
                    onSend={() => void sendEmail()}
                    billingActive={billingActive}
                    onStartTrial={() => void openCredits()}
                  />
                ) : null}
              </section>
            </div>
          </>
        )}

        {scan && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/40 px-4">
            <div className="w-full max-w-[22rem] shrink-0">
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
        <NewCampaignDialog
          availableLeadCount={availableLeadCount}
          generating={generating}
          onClose={() => setNewCampaignOpen(false)}
          onUseLeads={() => {
            setNewCampaignOpen(false);
            void generateFromBlueprint();
          }}
          onFindLeads={() => {
            setNewCampaignOpen(false);
            router.push("/dashboard/prospects?find=1");
          }}
          onCreateManual={createManualCampaign}
        />
      )}
    </div>
  );
}
