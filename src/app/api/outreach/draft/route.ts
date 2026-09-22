import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { draftFollowupForContact, draftOpener, renderTemplate } from "@/lib/outreach/draft";
import { tokenizeLeadMentions } from "@/lib/outreach/merge-fields";
import { getOwnedContact } from "@/lib/outreach/owned-contact";
import { getOutreachDraft, saveOutreachDraft } from "@/lib/outreach/persist-draft";
import { requireActiveBilling } from "@/lib/billing/entitlements";
import { spendCredits } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const maxDuration = 60;

const generateSchema = z.object({
  contactId: z.string().uuid(),
  campaignId: z.string().uuid(),
  stepId: z.string().uuid().optional(),
  stepIndex: z.number().int().min(0).max(9).optional(),
  regenerate: z.boolean().optional(),
});

const saveSchema = z.object({
  contactId: z.string().uuid(),
  campaignId: z.string().uuid(),
  stepId: z.string().uuid().optional(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
});

function firstName(fullName: string | null) {
  return (fullName ?? "").trim().split(/\s+/)[0] || "there";
}

async function userIdOr401() {
  try {
    return await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return null;
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const userId = await userIdOr401();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await requireActiveBilling(userId);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Billing required",
        code: "billing_required",
      },
      { status: 402 },
    );
  }

  const parsed = generateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const contact = await getOwnedContact(db, userId, parsed.data.contactId);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const { data: sequence } = await db
    .from("sequences")
    .select("id, name, pain, description, sequence_steps(id, step_order, delay_days, subject_template, body_template)")
    .eq("id", parsed.data.campaignId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!sequence) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const steps = [...(sequence.sequence_steps ?? [])].sort((a, b) => a.step_order - b.step_order);
  const stepIndex = parsed.data.stepId
    ? steps.findIndex((step) => step.id === parsed.data.stepId)
    : (parsed.data.stepIndex ?? 0);
  const step = steps[stepIndex >= 0 ? stepIndex : 0] ?? steps[0];
  const stepId = step?.id ?? parsed.data.stepId ?? null;

  if (!parsed.data.regenerate && stepId) {
    const existing = await getOutreachDraft(db, userId, contact.id, sequence.id, stepId);
    if (existing?.subject && existing.body) {
      return NextResponse.json({ ...existing, stepId, cached: true });
    }
  }

  const company = contact.company;
  const leadSource = {
    fullName: contact.full_name,
    title: contact.title,
    email: contact.email,
    companyName: company.name,
    companyDomain: company.domain,
  };
  const { data: blueprint } = await db
    .from("company_blueprints")
    .select("product_summary,value_prop")
    .eq("company_id", company.company_id)
    .maybeSingle();
  const { data: sender } = await db.from("companies").select("name").eq("id", company.company_id).maybeSingle();
  const senderName = (sender?.name ?? "there").split(/\s+/)[0] ?? "there";

  try {
    let draft;
    if (stepIndex > 0) {
      const previous = steps[stepIndex - 1];
      const previousDraft = previous
        ? await getOutreachDraft(db, userId, contact.id, sequence.id, previous.id)
        : null;
      draft = await draftFollowupForContact({
        contactName: contact.full_name,
        contactTitle: contact.title,
        companyName: company.name,
        companyDomain: company.domain,
        campaignName: sequence.name,
        campaignPain: sequence.pain,
        campaignDescription: sequence.description,
        productSummary: blueprint?.product_summary ?? blueprint?.value_prop ?? null,
        senderName,
        stepNumber: stepIndex + 1,
        delayDays: step?.delay_days ?? 3,
        previousSubject: previousDraft?.subject ?? previous?.subject_template ?? null,
        previousBody: previousDraft?.body ?? previous?.body_template ?? null,
      });
    } else {
      draft = await draftOpener({
        contactName: contact.full_name,
        contactTitle: contact.title,
        contactEmail: contact.email ?? "",
        companyName: company.name,
        companyDomain: company.domain,
        qualifyReason: contact.qualify_reason,
        productSummary: blueprint?.product_summary ?? blueprint?.value_prop ?? null,
        senderName,
        campaignName: sequence.name,
        campaignPain: sequence.pain,
      });
    }

    const subject = tokenizeLeadMentions(draft.subject, leadSource);
    const body = tokenizeLeadMentions(draft.body, leadSource);
    try {
      const creditBalance = await spendCredits({
        userId,
        amount: CREDIT_COSTS.email_draft,
        action: "email_draft",
        metadata: { contactId: contact.id, campaignId: sequence.id, stepId },
      });
      const saved = await saveOutreachDraft(db, userId, {
        contactId: contact.id,
        sequenceId: sequence.id,
        sequenceStepId: stepId,
        subject,
        body,
        source: "ai",
      });
      return NextResponse.json({ ...saved, stepId, cached: false, creditBalance });
    } catch (error) {
      const code = (error as { code?: string }).code;
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Out of credits", code: code ?? "credits_exhausted" },
        { status: 402 },
      );
    }
  } catch {
    if (stepIndex === 0) {
      const vars = { first_name: firstName(contact.full_name), company: company.name };
      const templateSubject = step ? renderTemplate(step.subject_template ?? "", vars) : "";
      const templateBody = step ? renderTemplate(step.body_template ?? "", vars) : "";
      if (templateBody.trim()) {
        const saved = await saveOutreachDraft(db, userId, {
          contactId: contact.id,
          sequenceId: sequence.id,
          sequenceStepId: stepId,
          subject: tokenizeLeadMentions(templateSubject || `Quick question for {{first_name}}`, leadSource),
          body: tokenizeLeadMentions(templateBody, leadSource),
          source: "template",
        });
        return NextResponse.json({ ...saved, stepId, cached: false });
      }
    }
    return NextResponse.json({ error: "Could not write this email" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const userId = await userIdOr401();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = saveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const contact = await getOwnedContact(db, userId, parsed.data.contactId);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  const { data: sequence } = await db
    .from("sequences")
    .select("id, sequence_steps(id, step_order)")
    .eq("id", parsed.data.campaignId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!sequence) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const steps = [...(sequence.sequence_steps ?? [])].sort((a, b) => a.step_order - b.step_order);
  const stepId = parsed.data.stepId ?? steps[0]?.id ?? null;

  const saved = await saveOutreachDraft(db, userId, {
    contactId: contact.id,
    sequenceId: sequence.id,
    sequenceStepId: stepId,
    subject: parsed.data.subject,
    body: parsed.data.body,
    source: "edit",
  });
  return NextResponse.json({ ...saved, stepId });
}
