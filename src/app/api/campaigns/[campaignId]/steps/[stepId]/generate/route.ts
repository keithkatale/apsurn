import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { draftFollowupTemplate } from "@/lib/outreach/draft";
import { updateSequenceStep } from "@/lib/sequences/mutations";

export const runtime = "nodejs";
export const maxDuration = 60;

async function userIdOr401() {
  try {
    return await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return null;
    throw error;
  }
}

export async function POST(_request: NextRequest, context: { params: Promise<{ campaignId: string; stepId: string }> }) {
  const userId = await userIdOr401();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { campaignId, stepId } = await context.params;
  const db = createAdminClient();

  const { data: sequence } = await db
    .from("sequences")
    .select("id, name, pain, description, company_id, sequence_steps(id, step_order, delay_days, subject_template, body_template)")
    .eq("id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!sequence) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const steps = [...(sequence.sequence_steps ?? [])].sort((a, b) => a.step_order - b.step_order);
  const stepIndex = steps.findIndex((step) => step.id === stepId);
  if (stepIndex < 0) return NextResponse.json({ error: "Step not found" }, { status: 404 });
  const step = steps[stepIndex];
  const previous = stepIndex > 0 ? steps[stepIndex - 1] : null;

  const [{ data: blueprint }, { data: sender }] = await Promise.all([
    db.from("company_blueprints").select("product_summary,value_prop").eq("company_id", sequence.company_id).maybeSingle(),
    db.from("companies").select("name").eq("id", sequence.company_id).maybeSingle(),
  ]);

  try {
    const draft = await draftFollowupTemplate({
      campaignName: sequence.name,
      campaignPain: sequence.pain,
      campaignDescription: sequence.description,
      productSummary: blueprint?.product_summary ?? blueprint?.value_prop ?? null,
      senderName: sender?.name ?? null,
      stepNumber: stepIndex + 1,
      delayDays: step.delay_days,
      previousSubject: previous?.subject_template ?? null,
      previousBody: previous?.body_template ?? null,
    });
    const result = await updateSequenceStep(db, userId, campaignId, stepId, {
      subjectTemplate: draft.subject,
      bodyTemplate: draft.body,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ subject: draft.subject, body: draft.body });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not write this follow-up" }, { status: 500 });
  }
}
