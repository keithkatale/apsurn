import type { SupabaseClient } from "@supabase/supabase-js";

export type OwnedContact = {
  id: string;
  full_name: string | null;
  title: string | null;
  email: string | null;
  qualify_reason: string | null;
  archived_at: string | null;
  company: {
    id: string;
    name: string;
    domain: string;
    user_id: string;
    company_id: string;
  };
};

export async function getOwnedContact(
  db: SupabaseClient,
  userId: string,
  contactId: string,
): Promise<OwnedContact | null> {
  const { data: contact, error } = await db
    .from("contacts")
    .select("id, full_name, title, email, qualify_reason, archived_at, prospect_company_id")
    .eq("id", contactId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!contact) return null;

  const { data: company, error: companyError } = await db
    .from("prospect_companies")
    .select("id, name, domain, user_id, company_id")
    .eq("id", contact.prospect_company_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (companyError) throw new Error(companyError.message);
  if (!company) return null;

  return { ...contact, company };
}

export async function listOwnedContactsByIds(
  db: SupabaseClient,
  userId: string,
  contactIds: string[],
): Promise<Array<{ id: string; email: string | null; archived_at: string | null }>> {
  if (contactIds.length === 0) return [];

  const { data: contacts, error } = await db
    .from("contacts")
    .select("id, email, archived_at, prospect_company_id")
    .in("id", contactIds);
  if (error) throw new Error(error.message);
  const rows = contacts ?? [];
  const companyIds = [...new Set(rows.map((row) => row.prospect_company_id))];
  if (companyIds.length === 0) return [];

  const { data: companies, error: companyError } = await db
    .from("prospect_companies")
    .select("id")
    .eq("user_id", userId)
    .in("id", companyIds);
  if (companyError) throw new Error(companyError.message);
  const owned = new Set((companies ?? []).map((row) => row.id));
  return rows.filter((row) => owned.has(row.prospect_company_id));
}

export async function listOwnedContactIdsForWorkspace(
  db: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return [];

  const { data: prospects, error } = await db
    .from("prospect_companies")
    .select("id")
    .eq("company_id", company.id)
    .eq("user_id", userId)
    .is("archived_at", null);
  if (error) throw new Error(error.message);
  const prospectIds = (prospects ?? []).map((row) => row.id);
  if (prospectIds.length === 0) return [];

  const { data: contacts, error: contactError } = await db
    .from("contacts")
    .select("id, email, archived_at")
    .in("prospect_company_id", prospectIds)
    .is("archived_at", null);
  if (contactError) throw new Error(contactError.message);
  return (contacts ?? []).filter((row) => Boolean(row.email)).map((row) => row.id);
}
