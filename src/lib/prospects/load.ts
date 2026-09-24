import type { SupabaseClient } from "@supabase/supabase-js";
import { describeOutreach, type OutreachState } from "./outreach";

interface RawContact {
  id: string;
  lead_status?: string;
  [key: string]: unknown;
}

interface RawCompany {
  id: string;
  list_id?: string | null;
  contacts?: RawContact[] | null;
  [key: string]: unknown;
}

export interface LoadedContact extends RawContact {
  lead_status: "new" | "qualified" | "contacted" | "replied" | "won" | "lost";
  outreach: OutreachState;
  in_campaign: boolean;
  contacted: boolean;
  campaign_name: string | null;
}

export interface LoadedCompany extends RawCompany {
  list_id: string | null;
  list_name: string | null;
  contacts: LoadedContact[];
}

function sequenceName(value: unknown): string | null {
  if (!value) return null;
  const row = Array.isArray(value) ? value[0] : value;
  if (row && typeof row === "object" && "name" in row && typeof row.name === "string") return row.name;
  return null;
}

/** Prospects, the list each company came from, and whether each contact is in a campaign or already contacted. */
export async function loadProspectCompanies(db: SupabaseClient, companyId: string): Promise<LoadedCompany[]> {
  const { data, error } = await db
    .from("prospect_companies")
    .select("*, contacts!contacts_prospect_company_id_fkey(*)")
    .eq("company_id", companyId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const companies = (data ?? []) as RawCompany[];
  const listIds = [...new Set(companies.map((company) => company.list_id).filter((id): id is string => typeof id === "string"))];
  const contactIds = companies.flatMap((company) => (company.contacts ?? []).map((contact) => contact.id));

  const [{ data: lists }, { data: enrollments }] = await Promise.all([
    listIds.length
      ? db.from("prospect_lists").select("id, name").in("id", listIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    contactIds.length
      ? db.from("enrollments").select("contact_id, status, current_step, sequences(name)").in("contact_id", contactIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const listName = new Map((lists ?? []).map((list) => [list.id, list.name]));
  const byContact = new Map<string, Array<{ status: string; current_step: number; campaignName: string | null }>>();
  for (const row of enrollments ?? []) {
    const contactId = String(row.contact_id ?? "");
    const entry = {
      status: String(row.status ?? ""),
      current_step: typeof row.current_step === "number" ? row.current_step : 0,
      campaignName: sequenceName(row.sequences),
    };
    const existing = byContact.get(contactId) ?? [];
    existing.push(entry);
    byContact.set(contactId, existing);
  }

  return companies.map((company) => ({
    ...company,
    list_id: typeof company.list_id === "string" ? company.list_id : null,
    list_name: typeof company.list_id === "string" ? (listName.get(company.list_id) ?? null) : null,
    contacts: (company.contacts ?? []).map((contact) => {
      const rows = byContact.get(contact.id) ?? [];
      const described = describeOutreach(String(contact.lead_status ?? "new"), rows);
      const active = rows.find((row) => row.status === "active") ?? rows[0];
      return {
        ...contact,
        lead_status: (contact.lead_status ?? "new") as LoadedContact["lead_status"],
        outreach: described.outreach,
        in_campaign: described.inCampaign,
        contacted: described.contacted,
        campaign_name: active?.campaignName ?? null,
      };
    }),
  }));
}
