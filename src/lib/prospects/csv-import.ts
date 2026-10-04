/**
 * Manual lead import: a user's own CSV, not a paid-API find. Column headers
 * are free text ("Company", "Work Email", "LI Profile", ...), so an AI pass
 * maps them to our schema once per file; a deterministic alias match is the
 * fallback when AI is unavailable or returns something unusable, so a bad
 * model response never blocks an import the user is sitting in front of.
 *
 * Every row the user uploaded is kept, verified-email or not — unlike the
 * paid-discovery pipeline (agent/persist.ts), which drops an unverified
 * email because another can always be found instead. There is no "another"
 * here: this is the user's own data, and losing a row they hand-typed would
 * be worse than keeping one with an unconfirmed address (outreach's own send
 * gate, ensureSendableEmail, is what stops a bad address from being mailed).
 *
 * Every saved row also writes through to the canonical index
 * (saveCanonicalCompany/saveCanonicalContact) so it is reusable by a future
 * prospecting run instead of being re-discovered or re-paid-for.
 */
import Papa from "papaparse";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiClient } from "@/lib/ai/openai";
import { verifyEmail } from "@/lib/prospecting/email-verifier";
import { isSuppressed, saveCanonicalCompany, saveCanonicalContact } from "@/lib/prospecting/pipeline";
import type { CandidateContact, ContactStatus } from "@/lib/prospecting/types";

const KNOWN_FIELDS = [
  "companyName",
  "domain",
  "websiteUrl",
  "industry",
  "employeeRange",
  "location",
  "fullName",
  "title",
  "email",
  "phone",
  "linkedinUrl",
] as const;
type KnownField = (typeof KNOWN_FIELDS)[number];

const FIELD_ALIASES: Record<KnownField, string[]> = {
  companyName: ["company", "company name", "organization", "organisation", "account", "account name"],
  domain: ["domain", "website domain", "company domain"],
  websiteUrl: ["website", "website url", "url", "site", "homepage"],
  industry: ["industry", "sector", "vertical", "category"],
  employeeRange: ["employees", "company size", "headcount", "employee count", "size", "# employees"],
  location: ["location", "city", "country", "address", "region", "hq"],
  fullName: ["name", "full name", "contact name", "lead name", "person", "first name last name"],
  title: ["title", "job title", "role", "position"],
  email: ["email", "email address", "work email", "e-mail"],
  phone: ["phone", "phone number", "mobile", "telephone", "cell"],
  linkedinUrl: ["linkedin", "linkedin url", "linkedin profile", "li profile", "li url"],
};

function heuristicMapping(headers: string[]): Record<string, KnownField | null> {
  const mapping: Record<string, KnownField | null> = {};
  for (const header of headers) {
    const normalized = header.trim().toLowerCase();
    mapping[header] = KNOWN_FIELDS.find((field) => normalized === field.toLowerCase() || FIELD_ALIASES[field].includes(normalized)) ?? null;
  }
  return mapping;
}

async function mapColumnsWithAi(headers: string[], sampleRows: Record<string, string>[]): Promise<Record<string, KnownField | null>> {
  const fallback = heuristicMapping(headers);
  try {
    const { ai, model } = await getAiClient();
    const sample = sampleRows
      .slice(0, 5)
      .map((row) => headers.map((h) => `${h}=${(row[h] ?? "").slice(0, 60)}`).join(" | "))
      .join("\n");
    const response = await ai.responses.create({
      model,
      input: `Map these spreadsheet column headers to our lead database fields.
Known fields: ${KNOWN_FIELDS.join(", ")}.
A header that doesn't match any of them (notes, tags, dates, etc.) should map to null.

Headers: ${JSON.stringify(headers)}

Sample rows:
${sample}

Return ONLY a JSON object: {"<exact header>": "<field>" | null, ...} for every header listed above. No markdown fences, no explanation.`,
      max_output_tokens: 1024,
    });
    const text = (response.output_text ?? "")
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const mapping: Record<string, KnownField | null> = {};
    for (const header of headers) {
      const value = parsed[header];
      mapping[header] =
        typeof value === "string" && (KNOWN_FIELDS as readonly string[]).includes(value) ? (value as KnownField) : fallback[header];
    }
    return mapping;
  } catch {
    return fallback;
  }
}

interface ImportRow {
  companyName: string | null;
  domain: string | null;
  websiteUrl: string | null;
  industry: string | null;
  employeeRange: string | null;
  location: string | null;
  fullName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
}

function applyMapping(row: Record<string, string>, mapping: Record<string, KnownField | null>): ImportRow {
  const out: ImportRow = {
    companyName: null,
    domain: null,
    websiteUrl: null,
    industry: null,
    employeeRange: null,
    location: null,
    fullName: null,
    title: null,
    email: null,
    phone: null,
    linkedinUrl: null,
  };
  for (const [header, field] of Object.entries(mapping)) {
    if (!field) continue;
    const value = row[header]?.trim();
    if (value) out[field] = value;
  }
  return out;
}

function normalizedDomainFrom(row: ImportRow): string | null {
  const raw = row.domain || row.websiteUrl || (row.email ? row.email.split("@")[1] : null);
  if (!raw) return null;
  try {
    const withScheme = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withScheme).hostname.replace(/^www\./, "").toLowerCase();
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

function normalizeName(fullName: string): string {
  return fullName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface ImportProgress {
  type: "mapping" | "progress" | "done";
  processed?: number;
  total?: number;
  companiesSaved?: number;
  contactsSaved?: number;
  skipped?: number;
}

export const MAX_IMPORT_ROWS = 1000;
const CONCURRENCY = 6;

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  return { headers: result.meta.fields ?? [], rows: result.data };
}

async function saveImportedCompany(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  domain: string,
  rows: ImportRow[]
): Promise<{ isNewCompany: boolean; contactsSaved: number; contactIds: string[] }> {
  const representative = rows.find((r) => r.companyName) ?? rows[0];

  const { data: existing } = await db
    .from("prospect_companies")
    .select("id")
    .eq("user_id", userId)
    .eq("domain", domain)
    .is("archived_at", null)
    .maybeSingle();

  const canonical = await saveCanonicalCompany({
    name: representative.companyName || domain,
    domain,
    websiteUrl: representative.websiteUrl || `https://${domain}`,
    industry: representative.industry,
    employeeRange: representative.employeeRange,
    location: representative.location,
    icpFitScore: 0.5,
    dataConfidence: 0.6,
    source: "csv_import",
    sourceRef: { discovery: "csv_import" },
  });

  let prospectId: string;
  if (existing) {
    prospectId = existing.id;
  } else {
    const { data: created, error } = await db
      .from("prospect_companies")
      .insert({
        user_id: userId,
        company_id: companyId,
        canonical_company_id: canonical.id,
        name: representative.companyName || domain,
        domain,
        website_url: representative.websiteUrl || `https://${domain}`,
        industry: representative.industry,
        employee_range: representative.employeeRange,
        location: representative.location,
        source: "csv_import",
        status: "new",
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Could not save company");
    prospectId = created.id;
  }

  let contactsSaved = 0;
  const contactIds: string[] = [];
  for (const row of rows) {
    if (!row.fullName && !row.email) continue;
    const email = row.email?.toLowerCase() || null;
    if (email && (await isSuppressed("email", email))) continue;

    if (email) {
      const { data: dupe } = await db
        .from("contacts")
        .select("id")
        .eq("prospect_company_id", prospectId)
        .eq("email", email)
        .is("archived_at", null)
        .maybeSingle();
      if (dupe) {
        contactIds.push(dupe.id);
        continue;
      }
    }

    const emailStatus: ContactStatus = email ? (await verifyEmail(email)).status : "observed";
    const fullName = row.fullName || email?.split("@")[0] || "Unknown";
    const normalizedName = normalizeName(fullName);

    const candidate: CandidateContact = {
      fullName,
      normalizedName,
      title: row.title,
      location: row.location,
      email,
      emailStatus,
      phone: row.phone,
      linkedinUrl: row.linkedinUrl,
      origin: "public",
      confidence: emailStatus === "verified" ? 0.85 : emailStatus === "accept_all" ? 0.7 : 0.5,
      evidence: [{ url: representative.websiteUrl || `https://${domain}`, excerpt: "Imported from CSV", observedAt: new Date().toISOString(), sourceType: "csv_import" }],
      source: "csv_import",
      sourceRef: { discovery: "csv_import" },
    };

    const canonicalPersonId = await saveCanonicalContact(canonical.id, domain, candidate);

    const { data: createdContact, error } = await db.from("contacts").insert({
      prospect_company_id: prospectId,
      canonical_person_id: canonicalPersonId,
      full_name: candidate.fullName,
      title: candidate.title,
      email,
      email_status: emailStatus,
      phone: candidate.phone,
      linkedin_url: candidate.linkedinUrl,
      source: "csv_import",
      contact_origin: "manual",
      confidence: candidate.confidence,
      evidence: candidate.evidence,
      observed_at: candidate.evidence[0].observedAt,
    })
      .select("id")
      .single();
    if (!error && createdContact) {
      contactsSaved += 1;
      contactIds.push(createdContact.id);
    }
  }

  return { isNewCompany: !existing, contactsSaved, contactIds };
}

export async function importCsv(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  csvText: string,
  emit: (event: ImportProgress) => void
): Promise<{ companiesSaved: number; contactsSaved: number; skipped: number; contactIds: string[] }> {
  const { headers, rows } = parseCsv(csvText);
  if (rows.length === 0) throw new Error("That file has no data rows");
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`That file has ${rows.length} rows — split it into batches of ${MAX_IMPORT_ROWS} or fewer`);
  }

  emit({ type: "mapping", total: rows.length });
  const mapping = await mapColumnsWithAi(headers, rows);
  const mapped = rows.map((row) => applyMapping(row, mapping)).filter((row) => row.fullName || row.email || row.companyName);

  const byDomain = new Map<string, ImportRow[]>();
  let noDomainCount = 0;
  for (const row of mapped) {
    const domain = normalizedDomainFrom(row);
    if (!domain) {
      noDomainCount += 1;
      continue;
    }
    const bucket = byDomain.get(domain) ?? [];
    bucket.push(row);
    byDomain.set(domain, bucket);
  }

  const domains = [...byDomain.keys()];
  let companiesSaved = 0;
  let contactsSaved = 0;
  let skipped = noDomainCount;
  const contactIds: string[] = [];
  let processed = noDomainCount;
  emit({ type: "progress", processed, total: mapped.length, companiesSaved, contactsSaved, skipped });

  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= domains.length) return;
      const domain = domains[index];
      const rowsForDomain = byDomain.get(domain)!;
      try {
        const result = await saveImportedCompany(db, userId, companyId, domain, rowsForDomain);
        if (result.isNewCompany) companiesSaved += 1;
        contactsSaved += result.contactsSaved;
        contactIds.push(...result.contactIds);
        skipped += rowsForDomain.length - result.contactsSaved;
      } catch {
        skipped += rowsForDomain.length;
      }
      processed += rowsForDomain.length;
      emit({ type: "progress", processed, total: mapped.length, companiesSaved, contactsSaved, skipped });
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(domains.length, 1)) }, worker));

  emit({ type: "done", companiesSaved, contactsSaved, skipped });
  return { companiesSaved, contactsSaved, skipped, contactIds };
}
