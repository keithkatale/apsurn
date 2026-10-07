import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { ensureLeadDraft, LeadDraftError } from "@/lib/outreach/lead-draft";
import { getOwnedContact } from "@/lib/outreach/owned-contact";
import { saveOutreachDraft } from "@/lib/outreach/persist-draft";

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
  try {
    const draft = await ensureLeadDraft(db, {
      userId,
      contactId: parsed.data.contactId,
      sequenceId: parsed.data.campaignId,
      stepId: parsed.data.stepId,
      stepIndex: parsed.data.stepIndex,
      regenerate: parsed.data.regenerate,
      // Guests and new accounts can write the email before a card is on file. Sending still requires checkout.
      allowWithoutCredits: true,
    });
    return NextResponse.json(draft);
  } catch (error) {
    if (error instanceof LeadDraftError) {
      const status = error.code === "contact_not_found" || error.code === "campaign_not_found" ? 404 : error.code === "credits_exhausted" ? 402 : 500;
      // No shared-template fallback: a failed draft is an error, never the campaign's generic copy.
      return NextResponse.json({ error: error.code === "draft_failed" ? "Could not write this email" : error.message, code: error.code }, { status });
    }
    throw error;
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
