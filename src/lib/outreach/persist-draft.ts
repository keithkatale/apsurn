import type { SupabaseClient } from "@supabase/supabase-js";
import { draftStorageKey } from "@/lib/outreach/merge-fields";

export type StoredDraft = {
  subject: string;
  body: string;
  source: string;
  sequenceStepId: string | null;
};

export { draftStorageKey as draftKey };

export async function getOutreachDraft(
  db: SupabaseClient,
  userId: string,
  contactId: string,
  sequenceId: string,
  sequenceStepId?: string | null,
): Promise<StoredDraft | null> {
  let query = db
    .from("outreach_drafts")
    .select("subject, body, source, sequence_step_id")
    .eq("user_id", userId)
    .eq("contact_id", contactId)
    .eq("sequence_id", sequenceId);

  if (sequenceStepId) {
    query = query.eq("sequence_step_id", sequenceStepId);
  } else {
    query = query.is("sequence_step_id", null);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    if (/outreach_drafts|sequence_step_id|does not exist|schema cache/i.test(error.message)) {
      // Fallback without step column (pre-migration).
      const legacy = await db
        .from("outreach_drafts")
        .select("subject, body, source")
        .eq("user_id", userId)
        .eq("contact_id", contactId)
        .eq("sequence_id", sequenceId)
        .maybeSingle();
      if (legacy.error || !legacy.data) return null;
      return {
        subject: legacy.data.subject ?? "",
        body: legacy.data.body ?? "",
        source: legacy.data.source ?? "ai",
        sequenceStepId: sequenceStepId ?? null,
      };
    }
    throw new Error(error.message);
  }
  if (!data) return null;
  return {
    subject: data.subject ?? "",
    body: data.body ?? "",
    source: data.source ?? "ai",
    sequenceStepId: data.sequence_step_id ?? null,
  };
}

export async function saveOutreachDraft(
  db: SupabaseClient,
  userId: string,
  input: {
    contactId: string;
    sequenceId: string;
    sequenceStepId?: string | null;
    subject: string;
    body: string;
    source?: string;
  },
): Promise<StoredDraft> {
  const row = {
    user_id: userId,
    contact_id: input.contactId,
    sequence_id: input.sequenceId,
    sequence_step_id: input.sequenceStepId ?? null,
    subject: input.subject,
    body: input.body,
    source: input.source ?? "ai",
    updated_at: new Date().toISOString(),
  };

  const withStep = await db
    .from("outreach_drafts")
    .upsert(row, { onConflict: "user_id,contact_id,sequence_id,sequence_step_id" })
    .select("subject, body, source, sequence_step_id")
    .maybeSingle();

  if (!withStep.error && withStep.data) {
    return {
      subject: withStep.data.subject ?? "",
      body: withStep.data.body ?? "",
      source: withStep.data.source ?? "ai",
      sequenceStepId: withStep.data.sequence_step_id ?? null,
    };
  }

  if (withStep.error && !/sequence_step_id|onConflict|unique|does not exist|schema cache/i.test(withStep.error.message)) {
    throw new Error(withStep.error.message);
  }

  // Pre-migration fallback: unique on (user_id, contact_id, sequence_id) only.
  const { sequence_step_id: _step, ...legacyRow } = row;
  const legacy = await db
    .from("outreach_drafts")
    .upsert(legacyRow, { onConflict: "user_id,contact_id,sequence_id" })
    .select("subject, body, source")
    .single();
  if (legacy.error || !legacy.data) throw new Error(legacy.error?.message ?? "Could not save draft");
  return {
    subject: legacy.data.subject ?? "",
    body: legacy.data.body ?? "",
    source: legacy.data.source ?? "ai",
    sequenceStepId: input.sequenceStepId ?? null,
  };
}
