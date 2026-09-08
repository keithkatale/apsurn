import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadStatus = "new" | "qualified" | "contacted" | "replied" | "won" | "lost";

export async function updateContacts(
  db: SupabaseClient,
  userId: string,
  contactIds: string[],
  patch: { leadStatus?: LeadStatus; archived?: boolean }
): Promise<{ updated: number }> {
  const { data: owned } = await db
    .from("contacts")
    .select("id, prospect_companies!inner(user_id)")
    .in("id", contactIds)
    .eq("prospect_companies.user_id", userId);

  const authorizedIds = (owned ?? []).map((row) => row.id);
  if (authorizedIds.length === 0) return { updated: 0 };

  const update: { lead_status?: string; archived_at?: string | null } = {};
  if (patch.leadStatus !== undefined) update.lead_status = patch.leadStatus;
  if (patch.archived !== undefined) update.archived_at = patch.archived ? new Date().toISOString() : null;

  const { error } = await db.from("contacts").update(update).in("id", authorizedIds);
  if (error) throw new Error(error.message);

  return { updated: authorizedIds.length };
}

export async function archiveProspectCompanies(
  db: SupabaseClient,
  userId: string,
  companyIds: string[]
): Promise<{ archived: number }> {
  const now = new Date().toISOString();

  const { data: owned } = await db.from("prospect_companies").select("id").in("id", companyIds).eq("user_id", userId);
  const authorizedIds = (owned ?? []).map((row) => row.id);
  if (authorizedIds.length === 0) return { archived: 0 };

  const { error: companyError } = await db.from("prospect_companies").update({ archived_at: now }).in("id", authorizedIds);
  if (companyError) throw new Error(companyError.message);

  const { error: contactError } = await db
    .from("contacts")
    .update({ archived_at: now })
    .in("prospect_company_id", authorizedIds)
    .is("archived_at", null);
  if (contactError) throw new Error(contactError.message);

  return { archived: authorizedIds.length };
}
