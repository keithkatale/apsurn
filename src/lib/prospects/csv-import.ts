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
 * The model only sees the header and a few rows at the top, enough to learn
 * the columns. The rest of the file is mapped in memory and written as one
 * table. Per-row email checks and canonical indexing are left out of this
 * path: they stalled the upload and left the campaign empty.
 */
import Papa from "papaparse";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiClient } from "@/lib/ai/openai";
import { suppressedEmails } from "@/lib/prospecting/pipeline";

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

export interface ImportProgress {
  type: "status" | "mapping" | "progress" | "done";
  stage?: "read" | "columns" | "structure" | "save";
  label?: string;
  progress?: number;
  processed?: number;
  total?: number;
  companiesSaved?: number;
  contactsSaved?: number;
  skipped?: number;
}

const FIELD_LABELS: Record<KnownField, string> = {
  companyName: "company",
  domain: "domain",
  websiteUrl: "website",
  industry: "industry",
  employeeRange: "company size",
  location: "location",
  fullName: "name",
  title: "title",
  email: "email",
  phone: "phone",
  linkedinUrl: "LinkedIn",
};

function describeColumns(mapping: Record<string, KnownField | null>): string {
  const fields = [...new Set(Object.values(mapping).filter((field): field is KnownField => Boolean(field)))];
  if (fields.length === 0) return "Reading each row from the headers in the file.";
  const labels = fields.map((field) => FIELD_LABELS[field]);
  return `Matched ${labels.join(", ")}.`;
}

export const MAX_IMPORT_ROWS = 1000;
const WRITE_CHUNK = 200;

function chunks<T>(values: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
  return out;
}

export type ImportedLead = {
  id: string;
  fullName: string | null;
  title: string | null;
  email: string | null;
  emailStatus: string;
  linkedinUrl: string | null;
  companyName: string;
  companyDomain: string;
};

export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  return { headers: result.meta.fields ?? [], rows: result.data };
}

type PreparedLead = ImportRow & { domain: string };

async function companyIdsByDomain(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  grouped: Map<string, PreparedLead[]>,
): Promise<{ ids: Map<string, string>; companiesSaved: number }> {
  const domains = [...grouped.keys()];
  const ids = new Map<string, string>();
  for (const part of chunks(domains, 80)) {
    const { data, error } = await db
      .from("prospect_companies")
      .select("id, domain")
      .eq("user_id", userId)
      .in("domain", part)
      .is("archived_at", null);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) ids.set(row.domain, row.id);
  }

  const missing = domains.filter((domain) => !ids.has(domain));
  let companiesSaved = 0;
  for (const part of chunks(missing, WRITE_CHUNK)) {
    const rows = part.map((domain) => {
      const people = grouped.get(domain) ?? [];
      const representative = people.find((row) => row.companyName) ?? people[0];
      return {
        user_id: userId,
        company_id: companyId,
        name: representative?.companyName || domain,
        domain,
        website_url: representative?.websiteUrl || `https://${domain}`,
        industry: representative?.industry ?? null,
        employee_range: representative?.employeeRange ?? null,
        location: representative?.location ?? null,
        source: "csv_import",
        status: "new",
      };
    });
    const { data, error } = await db.from("prospect_companies").insert(rows).select("id, domain");
    if (error) throw new Error(error.message);
    for (const row of data ?? []) ids.set(row.domain, row.id);
    companiesSaved += data?.length ?? 0;
  }
  return { ids, companiesSaved };
}

async function existingContactIds(db: SupabaseClient, userId: string, emails: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const part of chunks(emails, 80)) {
    const { data, error } = await db
      .from("contacts")
      .select("id, email, prospect_company_id, prospect_companies!contacts_prospect_company_id_fkey!inner(user_id)")
      .eq("prospect_companies.user_id", userId)
      .in("email", part)
      .is("archived_at", null);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      if (row.email) found.set(`${row.prospect_company_id}:${String(row.email).toLowerCase()}`, row.id);
    }
  }
  return found;
}

export async function importCsv(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  csvText: string,
  emit: (event: ImportProgress) => void
): Promise<{ companiesSaved: number; contactsSaved: number; skipped: number; contactIds: string[]; leads: ImportedLead[] }> {
  const { headers, rows } = parseCsv(csvText);
  if (rows.length === 0) throw new Error("That file has no data rows");
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`That file has ${rows.length} rows — split it into batches of ${MAX_IMPORT_ROWS} or fewer`);
  }

  emit({
    type: "status",
    stage: "read",
    label: `Reading ${rows.length} row${rows.length === 1 ? "" : "s"} from the file…`,
    progress: 8,
    total: rows.length,
  });
  emit({
    type: "status",
    stage: "columns",
    label: "Reading the header and the first rows to learn the columns…",
    progress: 14,
    total: rows.length,
  });
  const mapping = await mapColumnsWithAi(headers, rows);
  const columnLabel = describeColumns(mapping);
  emit({
    type: "mapping",
    stage: "columns",
    label: columnLabel,
    progress: 24,
    total: rows.length,
  });
  const mapped = rows.map((row) => applyMapping(row, mapping)).filter((row) => row.fullName || row.email || row.companyName);

  const prepared: PreparedLead[] = [];
  let skipped = rows.length - mapped.length;
  for (const row of mapped) {
    const domain = normalizedDomainFrom(row);
    if (!domain || (!row.fullName && !row.email)) {
      skipped += 1;
      continue;
    }
    prepared.push({ ...row, domain, email: row.email?.toLowerCase() ?? null });
  }

  const grouped = new Map<string, PreparedLead[]>();
  for (const row of prepared) {
    const bucket = grouped.get(row.domain) ?? [];
    bucket.push(row);
    grouped.set(row.domain, bucket);
  }

  emit({
    type: "status",
    stage: "structure",
    label:
      prepared.length === 0
        ? "No name, email, and company on those rows."
        : `Turned the file into a table of ${prepared.length} lead${prepared.length === 1 ? "" : "s"}.`,
    progress: 40,
    total: prepared.length,
    skipped,
  });
  if (prepared.length === 0) {
    return { companiesSaved: 0, contactsSaved: 0, skipped, contactIds: [], leads: [] };
  }

  emit({
    type: "status",
    stage: "save",
    label: "Saving the table…",
    progress: 55,
    total: prepared.length,
    skipped,
  });

  const { ids: companyIds, companiesSaved } = await companyIdsByDomain(db, userId, companyId, grouped);
  const blocked = await suppressedEmails(prepared.flatMap((row) => (row.email ? [row.email] : [])));
  const seen = new Set<string>();
  const drafts: Array<{ row: PreparedLead; prospectId: string; key: string }> = [];
  prepared.forEach((row, index) => {
    if (row.email && blocked.has(row.email)) {
      skipped += 1;
      return;
    }
    const identity = `${row.domain}:${row.email ?? row.fullName ?? index}`;
    if (seen.has(identity)) {
      skipped += 1;
      return;
    }
    seen.add(identity);
    const prospectId = companyIds.get(row.domain);
    if (!prospectId) {
      skipped += 1;
      return;
    }
    drafts.push({ row, prospectId, key: `${prospectId}:${index}` });
  });

  const known = await existingContactIds(
    db,
    userId,
    drafts.flatMap((draft) => (draft.row.email ? [draft.row.email] : [])),
  );
  const leads: ImportedLead[] = [];
  const fresh: typeof drafts = [];
  for (const draft of drafts) {
    const existingId = draft.row.email ? known.get(`${draft.prospectId}:${draft.row.email}`) : undefined;
    if (existingId) {
      leads.push(leadFrom(draft.row, existingId));
      continue;
    }
    fresh.push(draft);
  }

  const observedAt = new Date().toISOString();
  let contactsSaved = 0;
  for (const part of chunks(fresh, WRITE_CHUNK)) {
    const payload = part.map((draft) => ({
      prospect_company_id: draft.prospectId,
      full_name: draft.row.fullName || draft.row.email?.split("@")[0] || "Unknown",
      title: draft.row.title,
      email: draft.row.email,
      email_status: "observed",
      phone: draft.row.phone,
      linkedin_url: draft.row.linkedinUrl,
      source: "csv_import",
      source_ref: { importKey: draft.key },
      contact_origin: "manual",
      confidence: 0.5,
      evidence: [
        {
          url: draft.row.websiteUrl || `https://${draft.row.domain}`,
          excerpt: "Imported from CSV",
          observedAt,
          sourceType: "csv_import",
        },
      ],
      observed_at: observedAt,
    }));
    const { data, error } = await db
      .from("contacts")
      .insert(payload)
      .select("id, source_ref");
    if (error) throw new Error(error.message);
    const byKey = new Map(part.map((draft) => [draft.key, draft.row]));
    for (const created of data ?? []) {
      const key = (created.source_ref as { importKey?: string } | null)?.importKey;
      const row = key ? byKey.get(key) : undefined;
      if (!key || !row) continue;
      leads.push(leadFrom(row, created.id));
      contactsSaved += 1;
    }
  }

  emit({
    type: "done",
    stage: "save",
    label: `Saved ${contactsSaved} contact${contactsSaved === 1 ? "" : "s"}.`,
    progress: 90,
    total: prepared.length,
    companiesSaved,
    contactsSaved,
    skipped,
  });
  const withEmail = leads.filter((lead) => lead.email);
  return { companiesSaved, contactsSaved, skipped, contactIds: withEmail.map((lead) => lead.id), leads: withEmail };
}

function leadFrom(row: PreparedLead, id: string): ImportedLead {
  return {
    id,
    fullName: row.fullName,
    title: row.title,
    email: row.email,
    emailStatus: "observed",
    linkedinUrl: row.linkedinUrl,
    companyName: row.companyName || row.domain,
    companyDomain: row.domain,
  };
}
