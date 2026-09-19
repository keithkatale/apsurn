/**
 * Durable persistence for the scraping agent.
 *
 * Writes the same rows the generic pipeline does (canonical index +
 * per-list prospect_companies/contacts), plus a raw scrape_snapshots copy of
 * every page read, so a lead can be re-derived without re-fetching the source.
 */

import type { FetchedPage } from "@/lib/scraper/fetch-page";
import { isSuppressed, saveCanonicalCompany, saveCanonicalContact } from "../pipeline";
import type { CandidateCompany, CandidateContact } from "../types";
import type { AgentRunContext } from "./context";
import { rememberDirectory } from "./directories";

type PageKind = "directory_listing" | "company_detail" | "company_site" | "search" | "unknown";

/** Store our own raw copy of a fetched page (best-effort; never throws). */
export async function saveSnapshot(
  ctx: AgentRunContext,
  page: FetchedPage,
  pageKind: PageKind = "unknown"
): Promise<void> {
  try {
    await ctx.db.from("scrape_snapshots").upsert(
      {
        run_id: ctx.runId,
        url: page.url,
        final_url: page.finalUrl,
        http_status: page.status,
        content_hash: page.contentHash,
        title: page.title.slice(0, 500),
        text: page.text.slice(0, 200_000),
        html: page.html.slice(0, 1_000_000),
        rendered: page.rendered,
        page_kind: pageKind,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "run_id,url" }
    );
  } catch (error) {
    console.error("[agent] snapshot save failed", page.url, error instanceof Error ? error.message : error);
  }
}

export interface SaveLeadResult {
  saved: boolean;
  contactCount: number;
  reason?: string;
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
    return { saved: false, contactCount: 0, reason: "already saved this run" };
  }

  const candidateContacts = contacts.filter(
    (c) => c.emailStatus === "verified" || c.emailStatus === "accept_all" || Boolean(c.phone)
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

  // Remember the directory host (if the lead came from one) for future runs.
  const directoryHost = typeof company.sourceRef.directoryHost === "string" ? company.sourceRef.directoryHost : null;
  const directoryUrl = typeof company.sourceRef.directoryUrl === "string" ? company.sourceRef.directoryUrl : "";
  if (directoryHost) await rememberDirectory(ctx.db, directoryHost, directoryUrl, ctx.criteria);

  return { saved: true, contactCount };
}
