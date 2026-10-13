/** Saving one confirmed lead into a prospect list. Used by the save_lead tool. */
import { randomUUID } from "node:crypto";
import { getBillingStatus } from "@/lib/billing/entitlements";
import { SETUP_FREE_LEAD_CAP } from "@/lib/billing/plans";
import { verifyEmail } from "@/lib/prospecting/email-verifier";
import { persistLead } from "@/lib/prospecting/agent/persist";
import type { AgentRunContext } from "@/lib/prospecting/agent/context";
import { recordSignals } from "@/lib/prospecting/signals/run";
import { normalizeName } from "@/lib/prospecting/signals/tail";
import type { CandidateCompany, CandidateContact } from "@/lib/prospecting/types";
import type { AgentToolContext } from "./types";

const MAX_BATCH = 10;

/** Emails confirmed in this server process, so save_leads can refuse any address that did not come from find_verified_emails. */
const confirmed = new Map<string, number>();
const CONFIRMED_TTL_MS = 6 * 60 * 60 * 1000;
const confirmKey = (userId: string, email: string) => `${userId}:${email.trim().toLowerCase()}`;
export function remember(userId: string, email: string) {
  confirmed.set(confirmKey(userId, email), Date.now());
}
export function isRemembered(userId: string, email: string) {
  const at = confirmed.get(confirmKey(userId, email));
  return Boolean(at && Date.now() - at < CONFIRMED_TTL_MS);
}

async function loadAccount(ctx: AgentToolContext) {
  const { data: company } = await ctx.db
    .from("companies")
    .select("id, company_blueprints(product_summary, icp, personas)")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const rel = company?.company_blueprints;
  const blueprint = Array.isArray(rel) ? rel[0] : rel;
  return { companyId: (company?.id as string | undefined) ?? null, blueprint };
}

async function savedDomains(ctx: AgentToolContext): Promise<Set<string>> {
  const { data } = await ctx.db.from("prospect_companies").select("domain").eq("user_id", ctx.userId).is("archived_at", null).limit(5000);
  return new Set((data ?? []).map((row) => String(row.domain ?? "").toLowerCase()).filter(Boolean));
}

export async function saveLeads(ctx: AgentToolContext, args: Record<string, unknown>) {
  const leads = (Array.isArray(args.leads) ? args.leads : []).slice(0, MAX_BATCH) as Array<Record<string, unknown>>;
  if (leads.length === 0) return { error: "No leads to save." };

  const { companyId, blueprint } = await loadAccount(ctx);
  if (!companyId) return { error: "Finish setup first so there is a company to save leads under." };

  const billing = await getBillingStatus(ctx.userId);
  if (!billing.active) {
    const { count } = await ctx.db.from("prospect_companies").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).is("archived_at", null);
    if ((count ?? 0) >= SETUP_FREE_LEAD_CAP) {
      return { error: `Add a card to start with 50 free credits before saving more than ${SETUP_FREE_LEAD_CAP} leads.`, code: "billing_required" };
    }
  }

  const listName = typeof args.listName === "string" && args.listName.trim() ? args.listName.trim().slice(0, 120) : "Copilot leads";
  const { data: existing } = await ctx.db.from("prospect_lists").select("id").eq("user_id", ctx.userId).eq("name", listName).limit(1).maybeSingle();
  let listId = existing?.id as string | undefined;
  if (!listId) {
    const { data: created, error } = await ctx.db
      .from("prospect_lists")
      .insert({ user_id: ctx.userId, company_id: companyId, name: listName, criteria: { source: "ai" }, status: "completed", requested_count: leads.length })
      .select("id")
      .single();
    if (error || !created) return { error: error?.message ?? "Could not create the list." };
    listId = created.id as string;
  }

  const runCtx: AgentRunContext = {
    db: ctx.db,
    runId: randomUUID(),
    listId,
    userId: ctx.userId,
    listCompanyId: companyId,
    criteria: { industries: [], geographies: [], personas: [], minimumConfidence: 0.5, requiredContactChannels: ["email"] },
    productSummary: (blueprint?.product_summary as string | undefined) ?? null,
    budget: { maxSteps: 1_000_000, maxPages: 1_000_000, maxCompanies: 1_000_000, deadlineMs: Date.now() + 120_000 },
    counters: { steps: 0, pagesFetched: 0, companiesSaved: 0, contactsSaved: 0, warnings: 0 },
    savedDomains: await savedDomains(ctx),
    pageCache: new Map(),
    chargeCredits: billing.active,
    agentTaskId: ctx.taskId,
  };

  const results: Array<Record<string, unknown>> = [];
  for (const row of leads) {
    const domain = String(row.domain ?? "").trim().toLowerCase();
    const email = String(row.email ?? "").trim().toLowerCase();
    const fullName = String(row.fullName ?? "").trim();
    const companyName = String(row.companyName ?? domain).trim();
    if (!domain || !fullName || !email) {
      results.push({ company: companyName, saved: false, reason: "company domain, person and email are required" });
      continue;
    }
    // Only a mailbox confirmed in this session (or re-confirmed now) may enter the database.
    if (!isRemembered(ctx.userId, email)) {
      const check = await verifyEmail(email);
      if (check.status !== "verified") {
        results.push({ company: companyName, saved: false, reason: "that email could not be confirmed as a real mailbox" });
        continue;
      }
      remember(ctx.userId, email);
    }
    const reason = String(row.reason ?? "").trim();
    const signalUrl = typeof row.signalUrl === "string" && row.signalUrl ? row.signalUrl : `https://${domain}`;
    const now = new Date().toISOString();
    const company: CandidateCompany = {
      name: companyName,
      domain,
      websiteUrl: `https://${domain}`,
      description: typeof row.description === "string" ? row.description.slice(0, 600) : null,
      industry: null,
      employeeRange: null,
      location: null,
      icpFitScore: 0.75,
      dataConfidence: 0.8,
      source: "copilot_scout",
      sourceRef: { discovery: "copilot_scout", reason, signalUrl },
    };
    const contact: CandidateContact = {
      fullName,
      normalizedName: normalizeName(fullName),
      title: typeof row.title === "string" ? row.title : null,
      location: null,
      email,
      emailStatus: "verified",
      phone: null,
      linkedinUrl: typeof row.linkedinUrl === "string" ? row.linkedinUrl : null,
      origin: "public",
      confidence: 0.85,
      evidence: [{ url: signalUrl, excerpt: reason.slice(0, 500) || fullName, observedAt: now }],
      source: "copilot_scout",
      sourceRef: { qualifyReason: reason, discovery: "copilot_scout" },
    };
    try {
      const done = await persistLead(runCtx, company, [contact]);
      results.push({ company: companyName, saved: done.saved, ...(done.saved ? {} : { reason: done.reason }) });
      if (done.saved && reason) {
        await recordSignals(ctx.db, ctx.userId, runCtx.runId, {
          domain,
          companyName,
          score: 0.75,
          qualifyReason: reason,
          signals: [{ companyName, domain, triggerType: "launch", headline: reason.slice(0, 200), sourceUrl: signalUrl, excerpt: reason, eventDate: null, strength: 0.5 }],
        }).catch(() => undefined);
      }
      if (!done.saved && done.reason === "credits_exhausted") break;
    } catch (error) {
      results.push({ company: companyName, saved: false, reason: error instanceof Error ? error.message : "could not save" });
    }
  }

  const savedCount = runCtx.counters.companiesSaved;
  if (savedCount > 0) {
    const { count } = await ctx.db.from("prospect_companies").select("id", { count: "exact", head: true }).eq("list_id", listId);
    await ctx.db.from("prospect_lists").update({ found_count: count ?? savedCount, completed_at: new Date().toISOString() }).eq("id", listId);
  }
  return { listId, listName, saved: savedCount, results, note: savedCount > 0 ? "Saved. When every batch is saved, call present_leads with this listId." : "Nothing was saved." };
}

