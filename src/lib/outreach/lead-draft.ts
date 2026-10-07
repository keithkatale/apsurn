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
import { buildFollowupPrompt, buildOpenerPrompt, runDraft, streamDraft, type OutreachDraft } from "./draft";
import { loadLeadDossier } from "./lead-context";
import { tokenizeLeadMentions } from "./merge-fields";
import { getOwnedContact } from "./owned-contact";
import { loadSenderProfile } from "./sender";
import { fillSenderPlaceholders } from "./sender-name";
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

interface PreparedDraft {
  cached: EnsuredLeadDraft | null;
  prompt: string;
  failure: string;
  /** Save the finished draft (formatted, tokenized) and charge for it. */
  finish: (draft: OutreachDraft, options: { charge: boolean }) => Promise<EnsuredLeadDraft>;
}

/** Everything needed to write one lead's email at one step: their saved draft if there is one, else the prompt and how to save the result. */
async function prepareLeadDraft(db: SupabaseClient, input: EnsureLeadDraftInput): Promise<PreparedDraft> {
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
    if (existing?.subject && existing.body) {
      return { cached: { ...existing, stepId, cached: true }, prompt: "", failure: "", finish: async () => ({ ...existing, stepId, cached: true }) };
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
  const [{ data: blueprint }, senderProfile, dossier] = await Promise.all([
    db.from("company_blueprints").select("product_summary,value_prop").eq("company_id", company.company_id).maybeSingle(),
    loadSenderProfile(userId),
    loadLeadDossier(db, contact.id),
  ]);
  const senderName = senderProfile.firstName;
  const productSummary = blueprint?.product_summary ?? blueprint?.value_prop ?? null;
  const variant = input.regenerate ? Date.now() % 1000 : 0;

  let prompt: string;
  if (stepIndex > 0) {
    const previous = steps[stepIndex - 1];
    // The previous email to THIS lead, not the campaign template.
    const previousDraft = previous ? await getOutreachDraft(db, userId, contact.id, sequence.id, previous.id) : null;
    prompt = await buildFollowupPrompt({
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
    prompt = await buildOpenerPrompt({
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

  return {
    cached: null,
    prompt,
    failure: stepIndex > 0 ? "Follow-up draft failed" : "Outreach draft failed",
    finish: async (draft, options) => {
      let creditBalance: number | undefined;
      if (options.charge) {
        try {
          creditBalance = await spendCredits({
            userId,
            amount: CREDIT_COSTS.email_draft,
            action: "email_draft",
            metadata: { contactId: contact.id, campaignId: sequence.id, stepId },
          });
        } catch (error) {
          throw new LeadDraftError(error instanceof Error ? error.message : "Out of credits", "credits_exhausted");
        }
      }
      const saved = await saveOutreachDraft(db, userId, {
        contactId: contact.id,
        sequenceId: sequence.id,
        sequenceStepId: stepId,
        subject: tokenizeLeadMentions(draft.subject, leadSource),
        body: tokenizeLeadMentions(fillSenderPlaceholders(draft.body, senderName), leadSource),
        source: "ai",
      });
      return { ...saved, stepId, cached: false, creditBalance };
    },
  };
}

export async function ensureLeadDraft(db: SupabaseClient, input: EnsureLeadDraftInput): Promise<EnsuredLeadDraft> {
  const prepared = await prepareLeadDraft(db, input);
  if (prepared.cached) return prepared.cached;
  let draft: OutreachDraft;
  try {
    draft = await runDraft(prepared.prompt, prepared.failure);
  } catch (error) {
    throw new LeadDraftError(error instanceof Error ? error.message : "Could not write this email", "draft_failed");
  }
  return prepared.finish(draft, { charge: true });
}

/**
 * Writes one lead's email while streaming it: `onSubject` / `onBody` get the
 * text as it is produced. `charge: false` is for the free setup emails.
 * A saved draft is returned immediately without streaming.
 */
export async function streamLeadDraft(
  db: SupabaseClient,
  input: EnsureLeadDraftInput,
  handlers: { onSubject: (delta: string) => void; onBody: (delta: string) => void },
  options: { charge: boolean },
): Promise<EnsuredLeadDraft> {
  const prepared = await prepareLeadDraft(db, input);
  if (prepared.cached) return prepared.cached;
  let draft: OutreachDraft;
  try {
    draft = await streamDraft(prepared.prompt, handlers, prepared.failure);
  } catch (error) {
    throw new LeadDraftError(error instanceof Error ? error.message : "Could not write this email", "draft_failed");
  }
  return prepared.finish(draft, options);
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
