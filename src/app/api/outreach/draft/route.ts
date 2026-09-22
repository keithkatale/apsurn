import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { draftOpener, renderTemplate } from "@/lib/outreach/draft";
import { getOwnedContact } from "@/lib/outreach/owned-contact";
import { getOutreachDraft, saveOutreachDraft } from "@/lib/outreach/persist-draft";

export const runtime = "nodejs";
export const maxDuration = 60;

const generateSchema = z.object({
  contactId: z.string().uuid(),
  campaignId: z.string().uuid(),
  stepIndex: z.number().int().min(0).max(9).optional(),
  regenerate: z.boolean().optional(),
});

const saveSchema = z.object({
  contactId: z.string().uuid(),
  campaignId: z.string().uuid(),
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

  const parsed = generateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const contact = await getOwnedContact(db, userId, parsed.data.contactId);
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const { data: sequence } = await db
    .from("sequences")
    .select("id, name, pain, sequence_steps(step_order, subject_template, body_template)")
    .eq("id", parsed.data.campaignId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!sequence) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  if (!parsed.data.regenerate) {
    const existing = await getOutreachDraft(db, userId, contact.id, sequence.id);
    if (existing?.subject && existing.body) {
      return NextResponse.json({ ...existing, cached: true });
    }
  }

  const company = contact.company;
  const { data: blueprint } = await db
    .from("company_blueprints")
    .select("product_summary,value_prop")
    .eq("company_id", company.company_id)
    .maybeSingle();
  const { data: sender } = await db.from("companies").select("name").eq("id", company.company_id).maybeSingle();
  const senderName = (sender?.name ?? "there").split(/\s+/)[0] ?? "there";

  const steps = [...(sequence.sequence_steps ?? [])].sort((a, b) => a.step_order - b.step_order);
  const step = steps[parsed.data.stepIndex ?? 0] ?? steps[0];
  const vars = { first_name: firstName(contact.full_name), company: company.name };
  const templateSubject = step ? renderTemplate(step.subject_template ?? "", vars) : "";
  const templateBody = step ? renderTemplate(step.body_template ?? "", vars) : "";

  try {
    const draft = await draftOpener({
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
    const saved = await saveOutreachDraft(db, userId, {
      contactId: contact.id,
      sequenceId: sequence.id,
      subject: draft.subject,
      body: draft.body,
      source: "ai",
    });
    return NextResponse.json({ ...saved, cached: false });
  } catch {
    if (templateBody.trim()) {
      const saved = await saveOutreachDraft(db, userId, {
        contactId: contact.id,
        sequenceId: sequence.id,
        subject: templateSubject || `Quick question for ${firstName(contact.full_name)}`,
        body: templateBody,
        source: "template",
      });
      return NextResponse.json({ ...saved, cached: false });
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
    .select("id")
    .eq("id", parsed.data.campaignId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!sequence) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const saved = await saveOutreachDraft(db, userId, {
    contactId: contact.id,
    sequenceId: sequence.id,
    subject: parsed.data.subject,
    body: parsed.data.body,
    source: "edit",
  });
  return NextResponse.json(saved);
}
