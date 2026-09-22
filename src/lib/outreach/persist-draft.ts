import type { SupabaseClient } from "@supabase/supabase-js";

export type StoredDraft = {
  subject: string;
  body: string;
  source: string;
};

export function draftKey(contactId: string, sequenceId: string) {
  return `${contactId}:${sequenceId}`;
}

export async function getOutreachDraft(
  db: SupabaseClient,
  userId: string,
  contactId: string,
  sequenceId: string,
): Promise<StoredDraft | null> {
  const { data, error } = await db
    .from("outreach_drafts")
    .select("subject, body, source")
    .eq("user_id", userId)
    .eq("contact_id", contactId)
    .eq("sequence_id", sequenceId)
    .maybeSingle();
  if (error) {
    if (/outreach_drafts|does not exist|schema cache/i.test(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return { subject: data.subject ?? "", body: data.body ?? "", source: data.source ?? "ai" };
}

export async function saveOutreachDraft(
  db: SupabaseClient,
  userId: string,
  input: { contactId: string; sequenceId: string; subject: string; body: string; source?: string },
): Promise<StoredDraft> {
  const row = {
    user_id: userId,
    contact_id: input.contactId,
    sequence_id: input.sequenceId,
    subject: input.subject,
    body: input.body,
    source: input.source ?? "ai",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await db
    .from("outreach_drafts")
    .upsert(row, { onConflict: "user_id,contact_id,sequence_id" })
    .select("subject, body, source")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save draft");
  return { subject: data.subject ?? "", body: data.body ?? "", source: data.source ?? "ai" };
}
