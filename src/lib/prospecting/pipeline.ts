import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnabledDataSources } from "./registry";
import type { CandidateCompany, CandidateContact, ProspectCriteria, RunStatus } from "./types";

const CONTACTS_PER_COMPANY = 5;

async function progress(runId: string, listId: string, status: RunStatus, values: Record<string, unknown> = {}) {
  const db = createAdminClient();
  await Promise.all([
    db.from("prospecting_runs").update({ status, stage: status, updated_at: new Date().toISOString(), ...values }).eq("id", runId),
    db.from("prospect_lists").update({ status, ...(values.error_summary ? { error: values.error_summary } : {}) }).eq("id", listId),
  ]);
}

function valueHash(kind: string, value: string) {
  const pepper = process.env.SUPPRESSION_HASH_SECRET;
  if (!pepper) throw new Error("SUPPRESSION_HASH_SECRET is not configured");
  return createHash("sha256").update(`${pepper}:${kind}:${value.toLowerCase()}`).digest("hex");
}

async function isSuppressed(kind: "email" | "phone" | "profile", value: string) {
  const db = createAdminClient();
  const { data } = await db.from("suppressed_contact_values").select("id").eq("value_hash", valueHash(kind, value)).maybeSingle();
  return Boolean(data);
}

async function saveCanonicalCompany(candidate: CandidateCompany) {
  const db = createAdminClient();
  const now = new Date();
  const refresh = new Date(now.getTime() + 90 * 86400_000);
  const { data, error } = await db.from("indexed_companies").upsert({ domain: candidate.domain, name: candidate.name, website_url: candidate.websiteUrl, industry: candidate.industry, employee_range: candidate.employeeRange, location: candidate.location, last_indexed_at: now.toISOString(), refresh_after: refresh.toISOString(), updated_at: now.toISOString() }, { onConflict: "domain" }).select().single();
  if (error || !data) throw new Error(error?.message ?? "Could not index company");
  return data;
}

export async function saveCanonicalContact(companyId: string, domain: string, contact: CandidateContact) {
  const db = createAdminClient();
  const identityKey = createHash("sha256").update(`${domain}:${contact.normalizedName}`).digest("hex");
  const { data: person, error } = await db.from("indexed_people").upsert({ identity_key: identityKey, canonical_name: contact.fullName, normalized_name: contact.normalizedName, location: contact.location, updated_at: new Date().toISOString() }, { onConflict: "identity_key" }).select().single();
  if (error || !person) throw new Error(error?.message ?? "Could not index person");
  await db.from("indexed_employments").upsert({ person_id: person.id, company_id: companyId, title: contact.title, confidence: contact.confidence, last_observed_at: new Date().toISOString() }, { onConflict: "person_id,company_id" });
  const values: Array<{ kind: "email" | "phone" | "profile"; value: string | null; status: string }> = [
    { kind: "email", value: contact.email, status: contact.emailStatus },
    { kind: "phone", value: contact.phone, status: "observed" },
    { kind: "profile", value: contact.linkedinUrl, status: "observed" },
  ];
  for (const item of values) {
    if (!item.value || await isSuppressed(item.kind, item.value)) continue;
    const { data: point } = await db.from("contact_points").upsert({ person_id: person.id, company_id: companyId, kind: item.kind, normalized_value: item.value.toLowerCase(), display_value: item.value, origin: item.kind === "email" ? contact.origin : "public", status: item.status, confidence: contact.confidence, last_observed_at: new Date().toISOString(), last_verified_at: item.status === "verified" ? new Date().toISOString() : null, verification_metadata: contact.sourceRef.verification ?? {} }, { onConflict: "company_id,kind,normalized_value" }).select().single();
    if (point && contact.evidence[0]) {
      const evidence = contact.evidence[0];
      const { data: doc } = await db.from("source_documents").upsert({ company_id: companyId, url: evidence.url, source_type: evidence.sourceType ?? "website", content_hash: evidence.contentHash, fetched_at: evidence.observedAt }, { onConflict: "url" }).select().single();
      if (doc) await db.from("evidence_observations").insert({ source_document_id: doc.id, person_id: person.id, contact_point_id: point.id, field_name: item.kind, excerpt: evidence.excerpt, confidence: contact.confidence });
    }
  }
  return person.id as string;
}

export async function executeProspectingRun(runId: string, listId: string) {
  const db = createAdminClient();
  const { data: run } = await db.from("prospecting_runs").select("user_id,target_count").eq("id", runId).single();
  const { data: list } = await db.from("prospect_lists").select("company_id,criteria,requested_count").eq("id", listId).eq("user_id", run?.user_id ?? "").single();
  if (!run || !list) throw new Error("Prospecting run not found");
  const criteria = list.criteria as ProspectCriteria;
  await progress(runId, listId, "discovering", { started_at: new Date().toISOString() });
  const sources = getEnabledDataSources();
  const merged = new Map<string, CandidateCompany>();
  for (const source of sources) for (const candidate of await source.findCompanies(criteria, { limit: list.requested_count })) if (!merged.has(candidate.domain)) merged.set(candidate.domain, candidate);
  const candidates = [...merged.values()];
  await progress(runId, listId, "enriching", { target_count: candidates.length });
  let processed = 0, found = 0, contactCount = 0, warnings = 0;
  for (const candidate of candidates) {
    if (found >= list.requested_count) break;
    const { data: state } = await db.from("prospecting_runs").select("status").eq("id", runId).single();
    if (state?.status === "cancelled") return { found, contactCount, warnings, cancelled: true };
    try {
      const source = sources.find((value) => value.id === candidate.source);
      const contacts = source ? await source.findContacts(candidate, criteria, { limit: CONTACTS_PER_COMPANY }) : [];
      const actionableContacts = contacts.filter((contact) => contact.emailStatus === "verified" || Boolean(contact.phone));
      if (actionableContacts.length === 0) {
        warnings += 1;
      } else {
        const canonical = await saveCanonicalCompany(candidate);
        const { data: snapshot, error } = await db.from("prospect_companies").upsert({ user_id: run.user_id, company_id: list.company_id, list_id: listId, canonical_company_id: canonical.id, name: candidate.name, domain: candidate.domain, website_url: candidate.websiteUrl, industry: candidate.industry, employee_range: candidate.employeeRange, location: candidate.location, source: candidate.source, source_ref: candidate.sourceRef, icp_fit_score: candidate.icpFitScore, data_confidence: candidate.dataConfidence }, { onConflict: "list_id,domain" }).select().single();
        if (error || !snapshot) throw new Error(error?.message ?? "Could not save prospect");
        for (const contact of actionableContacts) {
          const canonicalPersonId = await saveCanonicalContact(canonical.id, candidate.domain, contact);
          await db.from("contacts").upsert({ prospect_company_id: snapshot.id, canonical_person_id: canonicalPersonId, full_name: contact.fullName, title: contact.title, email: contact.email, email_status: contact.emailStatus === "observed" ? "unverified" : contact.emailStatus, phone: contact.phone, linkedin_url: contact.linkedinUrl, source: contact.source, source_ref: contact.sourceRef, contact_origin: contact.origin, confidence: contact.confidence, evidence: contact.evidence, observed_at: contact.evidence[0]?.observedAt }, { onConflict: "prospect_company_id,canonical_person_id" });
          contactCount += 1;
        }
        found += 1;
      }
    } catch (error) { warnings += 1; console.error("[prospecting] company failed", candidate.domain, error); }
    finally { processed += 1; }
    await progress(runId, listId, "enriching", { processed_count: processed, contact_count: contactCount, warning_count: warnings });
  }
  const status: RunStatus = warnings > 0 ? "partial" : "completed";
  const completedAt = new Date().toISOString();
  await progress(runId, listId, status, { processed_count: processed, contact_count: contactCount, warning_count: warnings, completed_at: completedAt });
  await db.from("prospect_lists").update({ found_count: found, completed_at: completedAt }).eq("id", listId);
  return { found, contactCount, warnings };
}
