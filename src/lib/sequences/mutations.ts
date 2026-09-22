import type { SupabaseClient } from "@supabase/supabase-js";
import { generateCampaignIconSvg } from "@/lib/campaigns/icon";
import { defaultCopy } from "@/lib/onboarding/generate-campaign-copy";
import type { CampaignDefinition } from "@/lib/onboarding/campaign-templates";
import { listOwnedContactIdsForWorkspace, listOwnedContactsByIds } from "@/lib/outreach/owned-contact";

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
  input: {
    name: string;
    steps: SequenceStepInput[];
    description?: string;
    pain?: string;
    targeting?: string[];
    sampleAccounts?: string[];
    estimatedVolume?: number;
    segmentKey?: string;
    iconSvg?: string | null;
  }
): Promise<MutationResult<{ sequenceId: string }>> {
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return { ok: false, error: "Set up your company first", status: 400 };

  const extra = {
    description: input.description ?? null,
    pain: input.pain ?? null,
    targeting: input.targeting ?? [],
    sample_accounts: input.sampleAccounts ?? [],
    estimated_volume: input.estimatedVolume ?? null,
    segment_key: input.segmentKey || null,
    icon_svg: input.iconSvg ?? generateCampaignIconSvg(input),
  };
  const base = {
    user_id: userId,
    company_id: company.id,
    name: input.name,
    status: "draft",
    from_inbox_id: null,
  };

  let { data: sequence, error: sequenceError } = await db.from("sequences").insert({ ...base, ...extra }).select().single();
  if (sequenceError && /description|pain|targeting|sample_accounts|estimated_volume|segment_key|icon_svg/.test(sequenceError.message)) {
    ({ data: sequence, error: sequenceError } = await db.from("sequences").insert(base).select().single());
  }
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

export async function addSequenceStep(
  db: SupabaseClient,
  userId: string,
  sequenceId: string,
  input: { delayDays: number; subjectTemplate?: string | null; bodyTemplate?: string }
): Promise<MutationResult<{ id: string; stepOrder: number; delayDays: number; subject: string | null; body: string }>> {
  const { data: sequence } = await db.from("sequences").select("id").eq("id", sequenceId).eq("user_id", userId).maybeSingle();
  if (!sequence) return { ok: false, error: "Campaign not found", status: 404 };

  const { data: existing } = await db
    .from("sequence_steps")
    .select("step_order")
    .eq("sequence_id", sequenceId)
    .order("step_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (existing?.step_order ?? 0) + 1;

  const { data: step, error } = await db
    .from("sequence_steps")
    .insert({
      sequence_id: sequenceId,
      step_order: nextOrder,
      delay_days: input.delayDays,
      subject_template: input.subjectTemplate ?? null,
      body_template: input.bodyTemplate ?? "",
      stop_on_reply: true,
    })
    .select("id, step_order, delay_days, subject_template, body_template")
    .single();
  if (error || !step) return { ok: false, error: error?.message ?? "Could not add step", status: 500 };

  return {
    ok: true,
    data: {
      id: step.id,
      stepOrder: step.step_order,
      delayDays: step.delay_days,
      subject: step.subject_template,
      body: step.body_template,
    },
  };
}

export async function updateSequenceStep(
  db: SupabaseClient,
  userId: string,
  sequenceId: string,
  stepId: string,
  input: { delayDays?: number; subjectTemplate?: string | null; bodyTemplate?: string }
): Promise<MutationResult<{ id: string }>> {
  const { data: sequence } = await db.from("sequences").select("id").eq("id", sequenceId).eq("user_id", userId).maybeSingle();
  if (!sequence) return { ok: false, error: "Campaign not found", status: 404 };

  const patch: Record<string, unknown> = {};
  if (typeof input.delayDays === "number") patch.delay_days = input.delayDays;
  if (input.subjectTemplate !== undefined) patch.subject_template = input.subjectTemplate;
  if (input.bodyTemplate !== undefined) patch.body_template = input.bodyTemplate;
  if (Object.keys(patch).length === 0) return { ok: true, data: { id: stepId } };

  const { error } = await db.from("sequence_steps").update(patch).eq("id", stepId).eq("sequence_id", sequenceId);
  if (error) return { ok: false, error: error.message, status: 500 };
  return { ok: true, data: { id: stepId } };
}

export async function deleteSequenceStep(
  db: SupabaseClient,
  userId: string,
  sequenceId: string,
  stepId: string
): Promise<MutationResult<{ id: string }>> {
  const { data: sequence } = await db.from("sequences").select("id").eq("id", sequenceId).eq("user_id", userId).maybeSingle();
  if (!sequence) return { ok: false, error: "Campaign not found", status: 404 };

  const { data: steps } = await db
    .from("sequence_steps")
    .select("id, step_order")
    .eq("sequence_id", sequenceId)
    .order("step_order", { ascending: true });
  if (!steps || steps.length <= 1) {
    return { ok: false, error: "A campaign needs at least one email", status: 400 };
  }

  const { error } = await db.from("sequence_steps").delete().eq("id", stepId).eq("sequence_id", sequenceId);
  if (error) return { ok: false, error: error.message, status: 500 };

  const remaining = steps.filter((step) => step.id !== stepId);
  await Promise.all(
    remaining.map((step, index) =>
      step.step_order === index + 1
        ? Promise.resolve()
        : db.from("sequence_steps").update({ step_order: index + 1 }).eq("id", step.id)
    )
  );

  return { ok: true, data: { id: stepId } };
}

export async function enrollContacts(
  db: SupabaseClient,
  userId: string,
  sequenceId: string,
  contactIds: string[]
): Promise<MutationResult<{ enrolled: number; skipped: number }>> {
  const { data: sequence } = await db.from("sequences").select("id").eq("id", sequenceId).eq("user_id", userId).maybeSingle();
  if (!sequence) return { ok: false, error: "Sequence not found", status: 404 };

  const owned = await listOwnedContactsByIds(db, userId, contactIds);
  const eligibleIds = owned.filter((row) => row.archived_at === null && !!row.email).map((row) => row.id);

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

export async function persistCampaignDefinition(
  db: SupabaseClient,
  userId: string,
  campaign: CampaignDefinition,
  context: { senderName: string; companyName: string | null; valueProp: string | null },
  options: { uniquify?: boolean } = {},
): Promise<MutationResult<{ sequenceId: string; created: boolean }>> {
  let segmentKey = campaign.segmentKey;
  if (segmentKey) {
    const existing = await db
      .from("sequences")
      .select("id")
      .eq("user_id", userId)
      .eq("segment_key", segmentKey)
      .maybeSingle();
    if (!existing.error && existing.data?.id) {
      if (!options.uniquify) return { ok: true, data: { sequenceId: existing.data.id, created: false } };
      segmentKey = `${segmentKey}-${crypto.randomUUID().slice(0, 8)}`;
    }
  }

  const written = defaultCopy({ ...campaign, segmentKey }, context);
  const iconSvg = campaign.iconSvg ?? generateCampaignIconSvg({ ...written, outreachMethod: campaign.outreachMethod });
  campaign.iconSvg = iconSvg;
  const result = await createSequence(db, userId, {
    name: written.name,
    description: written.description,
    pain: written.pain,
    targeting: written.targeting,
    sampleAccounts: written.sampleAccounts,
    estimatedVolume: written.estimatedVolume,
    segmentKey: written.segmentKey,
    iconSvg,
    steps: written.steps,
  });
  if (!result.ok) return result;
  return { ok: true, data: { sequenceId: result.data.sequenceId, created: true } };
}

export async function enrollAllContactsIntoUserSequences(
  db: SupabaseClient,
  userId: string,
): Promise<{ enrolled: number }> {
  const [{ data: sequences }, contactIds] = await Promise.all([
    db.from("sequences").select("id").eq("user_id", userId).neq("status", "archived"),
    listOwnedContactIdsForWorkspace(db, userId),
  ]);
  if (!sequences?.length || contactIds.length === 0) return { enrolled: 0 };

  const results = await Promise.all(sequences.map((sequence) => enrollContacts(db, userId, sequence.id, contactIds)));
  return { enrolled: results.reduce((sum, result) => sum + (result.ok ? result.data.enrolled : 0), 0) };
}
