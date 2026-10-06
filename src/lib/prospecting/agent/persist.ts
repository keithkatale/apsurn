/**
 * Durable persistence for the prospecting pipeline.
 *
 * Writes the same rows the generic pipeline does: the canonical index plus
 * per-list prospect_companies/contacts.
 */

import { spendCredits } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { isSuppressed, saveCanonicalCompany, saveCanonicalContact } from "../pipeline";
import type { CandidateCompany, CandidateContact } from "../types";
import type { AgentRunContext } from "./context";
import { rememberDirectory } from "./directories";

export interface SaveLeadResult {
  saved: boolean;
  contactCount: number;
  reason?: string;
  creditsSpent?: number;
  creditBalance?: number;
}

/**
 * Persist one company + its actionable contacts into the user's list and the
 * canonical index. Idempotent via upserts. Dedupes by domain within a run.
 */
export async function persistLead(
  ctx: AgentRunContext,
  company: CandidateCompany,
  contacts: CandidateContact[]
): Promise<SaveLeadResult> {
  if (!company.domain) return { saved: false, contactCount: 0, reason: "no domain" };
  if (ctx.savedDomains.has(company.domain)) {
    return { saved: false, contactCount: 0, reason: "already in this account" };
  }

  const { data: existing } = await ctx.db
    .from("prospect_companies")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("domain", company.domain)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  if (existing) {
    ctx.savedDomains.add(company.domain);
    return { saved: false, contactCount: 0, reason: "already in this account" };
  }

  // An email only counts as a reachable address once the verifier has
  // actually confirmed it ("verified" or "accept_all" — the same bar
  // outreach uses to trust an address without re-checking at send time, see
  // ensureSendableEmail). A "risky" pattern guess or a verifier-rejected
  // address is dropped here rather than saved and later bouncing as
  // "Address not found" in outreach. A contact with a phone number is still
  // kept even without a verified email — the phone channel was never
  // subject to email verification. Email generation runs verification live
  // (resolveEmail / saveYcLeadsFirst), so by the time a contact reaches
  // this filter its status already reflects a real check, not a guess.
  const candidateContacts = contacts.filter(
    (c) => Boolean(c.fullName) && ((Boolean(c.email) && (c.emailStatus === "verified" || c.emailStatus === "accept_all")) || Boolean(c.phone))
  );
  // Drop contacts whose email/phone is on the global suppression list.
  const actionable: CandidateContact[] = [];
  for (const c of candidateContacts) {
    if (c.email && (await isSuppressed("email", c.email))) continue;
    if (!c.email && c.phone && (await isSuppressed("phone", c.phone))) continue;
    actionable.push(c);
  }
  if (actionable.length === 0) {
    ctx.counters.warnings += 1;
    return { saved: false, contactCount: 0, reason: "no actionable contacts" };
  }

  const canonical = await saveCanonicalCompany(company);

  const { data: snapshot, error } = await ctx.db
    .from("prospect_companies")
    .upsert(
      {
        user_id: ctx.userId,
        company_id: ctx.listCompanyId,
        list_id: ctx.listId,
        canonical_company_id: canonical.id,
        name: company.name,
        domain: company.domain,
        website_url: company.websiteUrl,
        industry: company.industry,
        employee_range: company.employeeRange,
        location: company.location,
        source: company.source,
        source_ref: company.sourceRef,
        icp_fit_score: company.icpFitScore,
        data_confidence: company.dataConfidence,
        // Skips the manual approval queue: every company reaching this point
        // already matched the ICP's industry/geography/headcount by
        // construction (Step 1) and carries a named contact found for it
        // (Step 2) — there is no separate judgment left for a human to
        // ratify before it becomes an actionable lead.
        status: "qualified",
      },
      { onConflict: "list_id,domain" }
    )
    .select()
    .single();
  if (error || !snapshot) throw new Error(error?.message ?? "Could not save prospect company");

  let contactCount = 0;
  let recommended: { id: string; confidence: number; qualifyReason: string | null; evidence: CandidateContact["evidence"] } | null = null;
  for (const contact of actionable) {
    const canonicalPersonId = await saveCanonicalContact(canonical.id, company.domain, contact);
    const qualifyReason =
      typeof contact.sourceRef.qualifyReason === "string" ? contact.sourceRef.qualifyReason : null;
    const { data: savedContact } = await ctx.db
      .from("contacts")
      .upsert(
        {
          prospect_company_id: snapshot.id,
          canonical_person_id: canonicalPersonId,
          full_name: contact.fullName,
          title: contact.title,
          email: contact.email,
          email_status: contact.emailStatus === "observed" ? "unverified" : contact.emailStatus,
          phone: contact.phone,
          linkedin_url: contact.linkedinUrl,
          source: contact.source,
          source_ref: contact.sourceRef,
          contact_origin: contact.origin,
          confidence: contact.confidence,
          evidence: contact.evidence,
          observed_at: contact.evidence[0]?.observedAt,
          qualify_reason: qualifyReason,
        },
        { onConflict: "prospect_company_id,canonical_person_id" }
      )
      .select("id")
      .single();
    contactCount += 1;
    if (savedContact && (!recommended || contact.confidence > recommended.confidence)) {
      recommended = { id: savedContact.id, confidence: contact.confidence, qualifyReason, evidence: contact.evidence };
    }
  }

  if (recommended) {
    await ctx.db
      .from("prospect_companies")
      .update({
        recommended_contact_id: recommended.id,
        qualify_reason: recommended.qualifyReason,
        evidence: recommended.evidence,
      })
      .eq("id", snapshot.id);
  }

  ctx.savedDomains.add(company.domain);
  ctx.counters.companiesSaved += 1;
  ctx.counters.contactsSaved += contactCount;

  if (!ctx.chargeCredits) {
    return { saved: true, contactCount, creditsSpent: 0 };
  }

  try {
    const creditBalance = await spendCredits({
      userId: ctx.userId,
      amount: CREDIT_COSTS.prospect_company,
      action: "prospect_company",
      metadata: {
        domain: company.domain,
        listId: ctx.listId,
        runId: ctx.runId,
        contactCount,
      },
      taskId: ctx.agentTaskId,
    });

    const directoryHost = typeof company.sourceRef.directoryHost === "string" ? company.sourceRef.directoryHost : null;
    const directoryUrl = typeof company.sourceRef.directoryUrl === "string" ? company.sourceRef.directoryUrl : "";
    if (directoryHost) await rememberDirectory(ctx.db, directoryHost, directoryUrl, ctx.criteria);

    return { saved: true, contactCount, creditsSpent: CREDIT_COSTS.prospect_company, creditBalance };
  } catch (error) {
    const code = (error as { code?: string }).code;
    // A task's approved budget running out stops the run the same way an empty balance does.
    if (code === "credits_exhausted" || code === "budget_exhausted") {
      await ctx.db.from("contacts").delete().eq("prospect_company_id", snapshot.id);
      await ctx.db.from("prospect_companies").delete().eq("id", snapshot.id);
      ctx.savedDomains.delete(company.domain);
      ctx.counters.companiesSaved -= 1;
      ctx.counters.contactsSaved -= contactCount;
      return { saved: false, contactCount: 0, reason: "credits_exhausted" };
    }
    throw error;
  }
}
