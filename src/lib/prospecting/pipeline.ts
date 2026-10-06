import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CandidateCompany, CandidateContact } from "./types";

/**
 * Shared canonical-index persistence, used by the directory agent
 * (src/lib/prospecting/agent/persist.ts) and the daily index refresh job.
 */

function valueHash(kind: string, value: string) {
  const pepper = process.env.SUPPRESSION_HASH_SECRET;
  if (!pepper) throw new Error("SUPPRESSION_HASH_SECRET is not configured");
  return createHash("sha256").update(`${pepper}:${kind}:${value.toLowerCase()}`).digest("hex");
}

export async function isSuppressed(kind: "email" | "phone" | "profile", value: string) {
  const db = createAdminClient();
  const { data } = await db.from("suppressed_contact_values").select("id").eq("value_hash", valueHash(kind, value)).maybeSingle();
  return Boolean(data);
}

/** One lookup for a whole imported list, instead of a query per address. */
export async function suppressedEmails(emails: string[]): Promise<Set<string>> {
  const pepper = process.env.SUPPRESSION_HASH_SECRET;
  const unique = [...new Set(emails.map((email) => email.toLowerCase()).filter(Boolean))];
  if (!pepper || unique.length === 0) return new Set();
  const db = createAdminClient();
  const byHash = new Map(unique.map((email) => [createHash("sha256").update(`${pepper}:email:${email}`).digest("hex"), email]));
  const blocked = new Set<string>();
  const hashes = [...byHash.keys()];
  for (let index = 0; index < hashes.length; index += 100) {
    const part = hashes.slice(index, index + 100);
    const { data } = await db.from("suppressed_contact_values").select("value_hash").in("value_hash", part);
    for (const row of data ?? []) {
      const email = byHash.get(row.value_hash);
      if (email) blocked.add(email);
    }
  }
  return blocked;
}

export async function saveCanonicalCompany(candidate: CandidateCompany) {
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
