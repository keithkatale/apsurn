/**
 * One personalized email for one lead at one step of a campaign. This is the
 * only way campaign emails get their copy: the sequence step's text is never
 * sent as a shared template. Used by the draft API (editor), the enrollment
 * job (drafts written as soon as leads join) and the send pass (safety net).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { spendCredits } from "@/lib/billing/credits";
import { getBillingStatus } from "@/lib/billing/entitlements";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { draftFollowupForContact, draftOpener } from "./draft";
import { loadLeadDossier } from "./lead-context";
import { tokenizeLeadMentions } from "./merge-fields";
import { getOwnedContact } from "./owned-contact";
import { getOutreachDraft, saveOutreachDraft, type StoredDraft } from "./persist-draft";

export class LeadDraftError extends Error {
  constructor(
    message: string,
    readonly code: "contact_not_found" | "campaign_not_found" | "credits_exhausted" | "draft_failed",
  ) {
    super(message);
  }
}

export interface EnsureLeadDraftInput {
  userId: string;
  contactId: string;
  sequenceId: string;
  stepId?: string | null;
  stepIndex?: number;
  regenerate?: boolean;
  /** Write the email even when this account has no credits yet. Used by the editor for guests and new accounts. */
  allowWithoutCredits?: boolean;
}

export type EnsuredLeadDraft = StoredDraft & { stepId: string | null; cached: boolean; creditBalance?: number };

export async function ensureLeadDraft(db: SupabaseClient, input: EnsureLeadDraftInput): Promise<EnsuredLeadDraft> {
  const { userId } = input;
  const contact = await getOwnedContact(db, userId, input.contactId);
  if (!contact) throw new LeadDraftError("Contact not found", "contact_not_found");

  const { data: sequence } = await db
    .from("sequences")
    .select("id, name, pain, description, sequence_steps(id, step_order, delay_days, subject_template, body_template)")
    .eq("id", input.sequenceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!sequence) throw new LeadDraftError("Campaign not found", "campaign_not_found");

  const steps = [...(sequence.sequence_steps ?? [])].sort((a, b) => a.step_order - b.step_order);
  const found = input.stepId ? steps.findIndex((step) => step.id === input.stepId) : (input.stepIndex ?? 0);
  const stepIndex = found >= 0 ? found : 0;
  const step = steps[stepIndex];
  const stepId = step?.id ?? input.stepId ?? null;

  if (!input.regenerate && stepId) {
    const existing = await getOutreachDraft(db, userId, contact.id, sequence.id, stepId);
    if (existing?.subject && existing.body) return { ...existing, stepId, cached: true };
  }

  const company = contact.company;
  const leadSource = {
    fullName: contact.full_name,
    title: contact.title,
    email: contact.email,
    companyName: company.name,
    companyDomain: company.domain,
  };
  const [{ data: blueprint }, { data: sender }, dossier] = await Promise.all([
    db.from("company_blueprints").select("product_summary,value_prop").eq("company_id", company.company_id).maybeSingle(),
    db.from("companies").select("name").eq("id", company.company_id).maybeSingle(),
    loadLeadDossier(db, contact.id),
  ]);
  const senderName = (sender?.name ?? "there").split(/\s+/)[0] ?? "there";
  const productSummary = blueprint?.product_summary ?? blueprint?.value_prop ?? null;
  const variant = input.regenerate ? Date.now() % 1000 : 0;

  let draft;
  try {
    if (stepIndex > 0) {
      const previous = steps[stepIndex - 1];
      // The previous email to THIS lead, not the campaign template.
      const previousDraft = previous ? await getOutreachDraft(db, userId, contact.id, sequence.id, previous.id) : null;
      draft = await draftFollowupForContact({
        contactName: contact.full_name,
        contactTitle: contact.title,
        companyName: company.name,
        companyDomain: company.domain,
        campaignName: sequence.name,
        campaignPain: sequence.pain,
        campaignDescription: sequence.description,
        productSummary,
        senderName,
        stepNumber: stepIndex + 1,
        delayDays: step?.delay_days ?? 3,
        previousSubject: previousDraft?.subject ?? null,
        previousBody: previousDraft?.body ?? null,
        userId,
        contactId: contact.id,
        variant,
        leadDossier: dossier.text,
        leadHasSpecifics: dossier.hasSpecifics,
      });
    } else {
      draft = await draftOpener({
        contactName: contact.full_name,
        contactTitle: contact.title,
        contactEmail: contact.email ?? "",
        companyName: company.name,
        companyDomain: company.domain,
        qualifyReason: contact.qualify_reason,
        productSummary,
        senderName,
        campaignName: sequence.name,
        campaignPain: sequence.pain,
        userId,
        contactId: contact.id,
        variant,
        leadDossier: dossier.text,
        leadHasSpecifics: dossier.hasSpecifics,
      });
    }
  } catch (error) {
    throw new LeadDraftError(error instanceof Error ? error.message : "Could not write this email", "draft_failed");
  }

  let creditBalance: number | undefined;
  const billing = await getBillingStatus(userId);
  const shouldCharge = billing.active || billing.creditBalance > 0 || !input.allowWithoutCredits;
  if (shouldCharge) {
    try {
      creditBalance = await spendCredits({
        userId,
        amount: CREDIT_COSTS.email_draft,
        action: "email_draft",
        metadata: { contactId: contact.id, campaignId: sequence.id, stepId },
      });
    } catch (error) {
      // A guest or a brand-new account has no card yet. Still save the copy. Sending is what requires checkout.
      if (!(input.allowWithoutCredits && !billing.active)) {
        throw new LeadDraftError(error instanceof Error ? error.message : "Out of credits", "credits_exhausted");
      }
    }
  }

  const saved = await saveOutreachDraft(db, userId, {
    contactId: contact.id,
    sequenceId: sequence.id,
    sequenceStepId: stepId,
    subject: tokenizeLeadMentions(draft.subject, leadSource),
    body: tokenizeLeadMentions(draft.body, leadSource),
    source: "ai",
  });
  return { ...saved, stepId, cached: false, creditBalance };
}

const DRAFT_CONCURRENCY = 3;

/** Write the opening email for every newly enrolled lead, a few at a time. Stops quietly if credits run out; the send pass fills any gaps. */
export async function draftOpenersForLeads(
  db: SupabaseClient,
  userId: string,
  sequenceId: string,
  contactIds: string[],
): Promise<{ drafted: number; failed: number }> {
  let drafted = 0;
  let failed = 0;
  let outOfCredits = false;
  const queue = [...contactIds];
  const worker = async () => {
    while (queue.length > 0 && !outOfCredits) {
      const contactId = queue.shift() as string;
      try {
        const result = await ensureLeadDraft(db, { userId, contactId, sequenceId, stepIndex: 0 });
        if (!result.cached) drafted += 1;
      } catch (error) {
        if (error instanceof LeadDraftError && error.code === "credits_exhausted") outOfCredits = true;
        else failed += 1;
        console.error("[draft-openers] failed", contactId, error instanceof Error ? error.message : error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(DRAFT_CONCURRENCY, contactIds.length) }, worker));
  return { drafted, failed };
}
