/**
 * Everything the app knows about one lead, written up as a dossier the
 * email writer must draw from. This is what makes each email specific to
 * the person instead of a campaign template with a name swapped in.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Evidence rows come from several sources with different shapes; keep whatever readable text they carry. */
function evidenceLines(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const text = [row.excerpt, row.snippet, row.quote, row.text, row.title, row.summary].find((v) => typeof v === "string" && v.trim()) as string | undefined;
    const url = typeof row.url === "string" ? row.url : typeof row.sourceUrl === "string" ? row.sourceUrl : "";
    if (text) lines.push(`${clip(text, 220)}${url ? ` (${url})` : ""}`);
    if (lines.length >= max) break;
  }
  return lines;
}

export interface LeadDossier {
  /** Prompt-ready text. */
  text: string;
  /** True when there is something specific to this lead beyond their name and role. */
  hasSpecifics: boolean;
}

export async function loadLeadDossier(db: SupabaseClient, contactId: string): Promise<LeadDossier> {
  const { data: contact } = await db
    .from("contacts")
    .select("full_name, title, linkedin_url, qualify_reason, evidence, prospect_company_id")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) return { text: "", hasSpecifics: false };

  const [{ data: company }, { data: signals }] = await Promise.all([
    db
      .from("prospect_companies")
      .select("name, domain, industry, employee_range, location, qualify_reason, evidence, website_url")
      .eq("id", contact.prospect_company_id)
      .maybeSingle(),
    db
      .from("prospect_signals")
      .select("trigger_type, headline, excerpt, source_url, event_date")
      .eq("prospect_company_id", contact.prospect_company_id)
      .order("event_date", { ascending: false, nullsFirst: false })
      .limit(4),
  ]);

  const lines: string[] = [];
  const person = [contact.full_name, contact.title && `— ${contact.title}`].filter(Boolean).join(" ");
  if (person) lines.push(`Person: ${person}`);
  if (contact.linkedin_url) lines.push(`LinkedIn: ${contact.linkedin_url}`);
  const personEvidence = evidenceLines(contact.evidence, 3);
  if (personEvidence.length) lines.push(`What is publicly known about them:\n${personEvidence.map((l) => `- ${l}`).join("\n")}`);

  if (company) {
    const facts = [company.industry, company.employee_range && `${company.employee_range} people`, company.location].filter(Boolean).join(" · ");
    lines.push(`Company: ${company.name} (${company.domain})${facts ? ` — ${facts}` : ""}`);
  }
  const reason = contact.qualify_reason || company?.qualify_reason;
  if (reason) lines.push(`Why they were picked as a lead: ${clip(String(reason), 400)}`);
  const companyEvidence = evidenceLines(company?.evidence, 3);
  if (companyEvidence.length) lines.push(`Evidence about the company:\n${companyEvidence.map((l) => `- ${l}`).join("\n")}`);

  const signalLines = (signals ?? []).map((s) => {
    const when = s.event_date ? ` (${String(s.event_date).slice(0, 10)})` : "";
    return `- [${s.trigger_type}]${when} ${clip(String(s.headline ?? ""), 160)}${s.excerpt ? ` — ${clip(String(s.excerpt), 200)}` : ""}`;
  });
  if (signalLines.length) lines.push(`Buying signals seen at their company:\n${signalLines.join("\n")}`);

  return { text: lines.join("\n"), hasSpecifics: Boolean(reason || personEvidence.length || companyEvidence.length || signalLines.length) };
}
