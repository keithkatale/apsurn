import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { draftFollowupForContact } from "@/lib/outreach/draft";
import { tokenizeLeadMentions } from "@/lib/outreach/merge-fields";
import { getOwnedContact } from "@/lib/outreach/owned-contact";
import { getOutreachDraft, saveOutreachDraft } from "@/lib/outreach/persist-draft";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  contactId: z.string().uuid(),
});

async function userIdOr401() {
  try {
    return await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return null;
    throw error;
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ campaignId: string; stepId: string }> }) {
  const userId = await userIdOr401();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { campaignId, stepId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Select a person first" }, { status: 400 });

  const db = createAdminClient();
  const contact = await getOwnedContact(db, userId, parsed.data.contactId);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

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
  const previousDraft = previous
    ? await getOutreachDraft(db, userId, contact.id, sequence.id, previous.id)
    : null;

  const [{ data: blueprint }, { data: sender }] = await Promise.all([
    db.from("company_blueprints").select("product_summary,value_prop").eq("company_id", sequence.company_id).maybeSingle(),
    db.from("companies").select("name").eq("id", sequence.company_id).maybeSingle(),
  ]);

  const company = contact.company;
  const leadSource = {
    fullName: contact.full_name,
    title: contact.title,
    email: contact.email,
    companyName: company.name,
    companyDomain: company.domain,
  };

  try {
    const draft = await draftFollowupForContact({
      contactName: contact.full_name,
      contactTitle: contact.title,
      companyName: company.name,
      companyDomain: company.domain,
      campaignName: sequence.name,
      campaignPain: sequence.pain,
      campaignDescription: sequence.description,
      productSummary: blueprint?.product_summary ?? blueprint?.value_prop ?? null,
      senderName: sender?.name ?? null,
      stepNumber: stepIndex + 1,
      delayDays: step.delay_days,
      previousSubject: previousDraft?.subject ?? null,
      previousBody: previousDraft?.body ?? null,
    });
    const subject = tokenizeLeadMentions(draft.subject, leadSource);
    const body = tokenizeLeadMentions(draft.body, leadSource);
    const saved = await saveOutreachDraft(db, userId, {
      contactId: contact.id,
      sequenceId: sequence.id,
      sequenceStepId: stepId,
      subject,
      body,
      source: "ai",
    });
    return NextResponse.json({ ...saved, stepId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not write this follow-up" }, { status: 500 });
  }
}
