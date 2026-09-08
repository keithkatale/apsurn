import type { SupabaseClient } from "@supabase/supabase-js";

export interface SequenceStepInput {
  subject_template?: string | null;
  body_template: string;
  delay_days?: number;
  stop_on_reply?: boolean;
}

export type MutationResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export async function listSequences(db: SupabaseClient, userId: string) {
  const { data: sequences, error } = await db
    .from("sequences")
    .select("id, name, status, sequence_steps(id)")
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (sequences ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    stepCount: (s.sequence_steps ?? []).length,
  }));
}

export async function createSequence(
  db: SupabaseClient,
  userId: string,
  input: { name: string; steps: SequenceStepInput[] }
): Promise<MutationResult<{ sequenceId: string }>> {
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return { ok: false, error: "Set up your company first", status: 400 };

  const { data: sequence, error: sequenceError } = await db
    .from("sequences")
    .insert({ user_id: userId, company_id: company.id, name: input.name, status: "draft", from_inbox_id: null })
    .select()
    .single();
  if (sequenceError || !sequence) {
    return { ok: false, error: sequenceError?.message ?? "Failed to create sequence", status: 500 };
  }

  const { error: stepsError } = await db.from("sequence_steps").insert(
    input.steps.map((step, index) => ({
      sequence_id: sequence.id,
      step_order: index + 1,
      delay_days: step.delay_days ?? 0,
      subject_template: step.subject_template ?? null,
      body_template: step.body_template,
      stop_on_reply: step.stop_on_reply ?? true,
    }))
  );
  if (stepsError) return { ok: false, error: stepsError.message, status: 500 };

  return { ok: true, data: { sequenceId: sequence.id } };
}

export async function enrollContacts(
  db: SupabaseClient,
  userId: string,
  sequenceId: string,
  contactIds: string[]
): Promise<MutationResult<{ enrolled: number; skipped: number }>> {
  const { data: sequence } = await db.from("sequences").select("id").eq("id", sequenceId).eq("user_id", userId).maybeSingle();
  if (!sequence) return { ok: false, error: "Sequence not found", status: 404 };

  const { data: owned } = await db
    .from("contacts")
    .select("id, email, archived_at, prospect_companies!inner(user_id)")
    .in("id", contactIds)
    .eq("prospect_companies.user_id", userId);

  const eligibleIds = (owned ?? []).filter((row) => row.archived_at === null && !!row.email).map((row) => row.id);

  if (eligibleIds.length === 0) {
    return { ok: true, data: { enrolled: 0, skipped: contactIds.length } };
  }

  const { data: inserted, error } = await db
    .from("enrollments")
    .upsert(
      eligibleIds.map((contactId) => ({
        sequence_id: sequenceId,
        contact_id: contactId,
        status: "active",
        current_step: 0,
        next_send_at: new Date().toISOString(),
      })),
      { onConflict: "sequence_id,contact_id", ignoreDuplicates: true }
    )
    .select("id");
  if (error) return { ok: false, error: error.message, status: 500 };

  const enrolled = inserted?.length ?? 0;
  return { ok: true, data: { enrolled, skipped: contactIds.length - enrolled } };
}
