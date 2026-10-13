import { publishArtifact } from "@/lib/copilot/artifacts";
import type { AgentToolContext } from "./types";

export interface PresentedLead {
  id: string;
  name: string | null;
  title: string | null;
  email: string | null;
  emailStatus: string | null;
  linkedinUrl: string | null;
  company: string;
  domain: string;
  description: string | null;
  country: string | null;
  fit: number | null;
  /** Why this company and this person were picked. */
  reason: string | null;
  /** The buying signal behind it, if any. */
  signal: string | null;
  /** How to open the conversation. */
  angle: string | null;
}

type ContactRecord = {
  id: string;
  full_name: string | null;
  title: string | null;
  email: string | null;
  email_status: string | null;
  linkedin_url: string | null;
  country: string | null;
  qualify_reason: string | null;
};

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

/**
 * Show a finished run's leads as one table with the context behind each row: what the company does, why it was
 * picked, the signal it showed and an angle for the first email. Rows come from the saved leads; only the angles
 * are supplied by the agent.
 */
export async function presentLeads(ctx: AgentToolContext, args: Record<string, unknown>) {
  const listId = String(args.listId ?? "");
  const { data: list } = await ctx.db.from("prospect_lists").select("id, name").eq("id", listId).eq("user_id", ctx.userId).maybeSingle();
  if (!list) return { error: "List not found." };
  const run = { list_id: list.id as string };

  const { data: companies } = await ctx.db
    .from("prospect_companies")
    .select("id, name, domain, description, country, icp_fit_score, qualify_reason, contacts!contacts_prospect_company_id_fkey(id, full_name, title, email, email_status, linkedin_url, country, qualify_reason)")
    .eq("list_id", run.list_id)
    .eq("user_id", ctx.userId)
    .is("archived_at", null)
    .order("icp_fit_score", { ascending: false, nullsFirst: false })
    .limit(40);
  const domains = (companies ?? []).map((row) => String(row.domain ?? "").toLowerCase()).filter(Boolean);
  const { data: signals } = domains.length
    ? await ctx.db.from("prospect_signals").select("domain, headline, score").eq("user_id", ctx.userId).in("domain", domains).order("score", { ascending: false, nullsFirst: false })
    : { data: [] as Array<{ domain: string; headline: string }> };

  const signalByCompany = new Map<string, string>();
  for (const row of signals ?? []) {
    const domain = String(row.domain ?? "").toLowerCase();
    if (domain && !signalByCompany.has(domain)) signalByCompany.set(domain, String(row.headline ?? ""));
  }

  const angles = new Map<string, string>();
  if (Array.isArray(args.angles)) {
    for (const item of args.angles) {
      if (!item || typeof item !== "object") continue;
      const { company, angle } = item as { company?: unknown; angle?: unknown };
      if (typeof company === "string" && typeof angle === "string" && angle.trim()) {
        angles.set(company.trim().toLowerCase(), clip(angle.trim(), 400));
      }
    }
  }

  const rows: PresentedLead[] = (companies ?? []).flatMap((company) => {
    const contacts = (Array.isArray(company.contacts) ? company.contacts : []) as ContactRecord[];
    const angle = angles.get(String(company.name ?? "").toLowerCase()) ?? angles.get(String(company.domain ?? "").toLowerCase()) ?? null;
    const base = {
      company: String(company.name ?? ""),
      domain: String(company.domain ?? ""),
      description: (company.description as string | null) ?? null,
      country: (company.country as string | null) ?? null,
      fit: typeof company.icp_fit_score === "number" ? company.icp_fit_score : null,
      signal: signalByCompany.get(String(company.domain ?? "").toLowerCase()) ?? null,
      angle,
    };
    if (contacts.length === 0) {
      return [{ ...base, id: String(company.id), name: null, title: null, email: null, emailStatus: null, linkedinUrl: null, reason: (company.qualify_reason as string | null) ?? null }];
    }
    return contacts.map((contact) => ({
      ...base,
      id: contact.id,
      name: contact.full_name,
      title: contact.title,
      email: contact.email,
      emailStatus: contact.email_status,
      linkedinUrl: contact.linkedin_url,
      country: contact.country ?? base.country,
      reason: contact.qualify_reason ?? (company.qualify_reason as string | null) ?? null,
    }));
  });

  if (rows.length === 0) return { presented: 0, note: "That list has no leads yet, so there is nothing to show." };

  const artifact = await publishArtifact(ctx, {
    kind: "lead_table",
    title: typeof args.title === "string" && args.title.trim() ? args.title.trim().slice(0, 120) : "Leads",
    payload: { presentation: "run", listId, rows },
  });
  return { presented: rows.length, artifactId: artifact?.id, note: "The table is on screen. Do not repeat the rows in text; add at most two sentences of takeaway." };
}
