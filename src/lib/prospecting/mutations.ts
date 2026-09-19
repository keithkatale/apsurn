import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadStatus = "new" | "qualified" | "contacted" | "replied" | "won" | "lost";

export async function updateContacts(
  db: SupabaseClient,
  userId: string,
  contactIds: string[],
  patch: {
    leadStatus?: LeadStatus;
    archived?: boolean;
    fullName?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
  }
): Promise<{ updated: number }> {
  const { data: owned } = await db
    .from("contacts")
    .select("id, prospect_companies!inner(user_id)")
    .in("id", contactIds)
    .eq("prospect_companies.user_id", userId);

  const authorizedIds = (owned ?? []).map((row) => row.id);
  if (authorizedIds.length === 0) return { updated: 0 };

  const update: {
    lead_status?: string;
    archived_at?: string | null;
    full_name?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedin_url?: string | null;
  } = {};
  if (patch.leadStatus !== undefined) update.lead_status = patch.leadStatus;
  if (patch.archived !== undefined) update.archived_at = patch.archived ? new Date().toISOString() : null;
  if (patch.fullName !== undefined) update.full_name = patch.fullName;
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.email !== undefined) update.email = patch.email;
  if (patch.phone !== undefined) update.phone = patch.phone;
  if (patch.linkedinUrl !== undefined) update.linkedin_url = patch.linkedinUrl;

  const { error } = await db.from("contacts").update(update).in("id", authorizedIds);
  if (error) throw new Error(error.message);

  return { updated: authorizedIds.length };
}

export type ProspectCompanyStatus = "new" | "qualified" | "rejected" | "contacted";

export async function setProspectCompanyStatus(
  db: SupabaseClient,
  userId: string,
  companyIds: string[],
  status: "qualified" | "rejected",
  correction?: { icpFitScore?: number; qualifyReason?: string; recommendedContactId?: string | null }
): Promise<{ updated: number }> {
  const { data: owned } = await db.from("prospect_companies").select("id").in("id", companyIds).eq("user_id", userId);
  const authorizedIds = (owned ?? []).map((row) => row.id);
  if (authorizedIds.length === 0) return { updated: 0 };

  const update: Record<string, unknown> = { status };
  if (correction?.icpFitScore !== undefined) update.icp_fit_score = correction.icpFitScore;
  if (correction?.qualifyReason !== undefined) update.qualify_reason = correction.qualifyReason;
  if (correction?.recommendedContactId !== undefined) update.recommended_contact_id = correction.recommendedContactId;

  const { error } = await db.from("prospect_companies").update(update).in("id", authorizedIds);
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
