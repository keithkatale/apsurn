import { spendCredits } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { draftFollowupForContact, draftOpener, renderTemplate } from "@/lib/outreach/draft";
import { tokenizeLeadMentions } from "@/lib/outreach/merge-fields";
import { getOwnedContact } from "@/lib/outreach/owned-contact";
import { getOutreachDraft, saveOutreachDraft } from "@/lib/outreach/persist-draft";
import { getSequenceOverview, listContacts, listProspectCompanies } from "./shared";
import type { AgentToolContext, SpecialistModule } from "./types";

const instruction = `You are Writer, apsurn's outreach copy specialist.

You draft emails for a specific contact and sequence. You never send. You never create sequences — that is Operator. If the user wants something sent, tell Copilot to hand that to Operator after they confirm.

You talk to Copilot, not the user. Look up contacts and sequences first. Use the briefing for value prop, positioning, and persona pain.

If list_contacts and list_prospect_companies are both empty, stop and say the pipeline is empty so Copilot can have Researcher pull leads. Do not ask the user to pick a contact or wait for them. Return the subject and body you saved so Copilot can show them.`;

export const WRITER_TOOLS = [
  {
    name: "list_contacts",
    description: "Find contacts by name, email, lead status, or company so you can draft for the right person. Call this before drafting.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        leadStatus: { type: "string", enum: ["new", "qualified", "contacted", "replied", "won", "lost"] },
        companyId: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "list_prospect_companies",
    description: "List prospected companies already in the account. Use this if list_contacts is empty.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        status: { type: "string", enum: ["new", "qualified", "rejected", "contacted"] },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "get_sequence_overview",
    description: "List sequences or get one sequence's steps so you can pick the right campaign.",
    parameters: {
      type: "object",
      properties: { sequenceId: { type: "string" } },
    },
  },
  {
    name: "draft_outreach_email",
    description: "Write and persist an outreach draft for a contact + sequence. Uses a cached draft unless regenerate is true.",
    parameters: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        sequenceId: { type: "string" },
        stepId: { type: "string" },
        regenerate: { type: "boolean" },
      },
      required: ["contactId", "sequenceId"],
    },
  },
] as const;

function firstName(fullName: string | null) {
  return (fullName ?? "").trim().split(/\s+/)[0] || "there";
}

async function draftEmail(ctx: AgentToolContext, args: Record<string, unknown>) {
  const contact = await getOwnedContact(ctx.db, ctx.userId, String(args.contactId));
  if (!contact) return { error: "Contact not found." };
  if (contact.archived_at) return { error: "That contact is archived." };

  const { data: sequence } = await ctx.db
    .from("sequences")
    .select("id, name, pain, description, sequence_steps(id, step_order, delay_days, subject_template, body_template)")
    .eq("id", String(args.sequenceId))
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!sequence) return { error: "Sequence not found." };

  const steps = [...(sequence.sequence_steps ?? [])].sort((a, b) => a.step_order - b.step_order);
  const stepIndex = typeof args.stepId === "string" ? steps.findIndex((step) => step.id === args.stepId) : 0;
  const step = steps[stepIndex >= 0 ? stepIndex : 0] ?? steps[0];
  const stepId = step?.id ?? (typeof args.stepId === "string" ? args.stepId : null);

  if (!args.regenerate && stepId) {
    const existing = await getOutreachDraft(ctx.db, ctx.userId, contact.id, sequence.id, stepId);
    if (existing?.subject && existing.body) {
      return { ...existing, stepId, cached: true };
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
  const { data: blueprint } = await ctx.db
    .from("company_blueprints")
    .select("product_summary,value_prop")
    .eq("company_id", company.company_id)
    .maybeSingle();
  const { data: sender } = await ctx.db.from("companies").select("name").eq("id", company.company_id).maybeSingle();
  const senderName = (sender?.name ?? "there").split(/\s+/)[0] ?? "there";

  try {
    let draft;
    if (stepIndex > 0) {
      const previous = steps[stepIndex - 1];
      const previousDraft = previous ? await getOutreachDraft(ctx.db, ctx.userId, contact.id, sequence.id, previous.id) : null;
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
    const creditBalance = await spendCredits({
      userId: ctx.userId,
      amount: CREDIT_COSTS.email_draft,
      action: "email_draft",
      metadata: { contactId: contact.id, campaignId: sequence.id, stepId, source: "writer" },
    });
    const saved = await saveOutreachDraft(ctx.db, ctx.userId, {
      contactId: contact.id,
      sequenceId: sequence.id,
      sequenceStepId: stepId,
      subject,
      body,
      source: "ai",
    });
    return { ...saved, stepId, cached: false, creditBalance, contactName: contact.full_name, sequenceName: sequence.name };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "credits_exhausted") {
      return { error: error instanceof Error ? error.message : "Out of credits", code };
    }
    if (stepIndex === 0 && step) {
      const vars = { first_name: firstName(contact.full_name), company: company.name };
      const templateSubject = renderTemplate(step.subject_template ?? "", vars);
      const templateBody = renderTemplate(step.body_template ?? "", vars);
      if (templateBody.trim()) {
        const saved = await saveOutreachDraft(ctx.db, ctx.userId, {
          contactId: contact.id,
          sequenceId: sequence.id,
          sequenceStepId: stepId,
          subject: tokenizeLeadMentions(templateSubject || `Quick question for {{first_name}}`, leadSource),
          body: tokenizeLeadMentions(templateBody, leadSource),
          source: "template",
        });
        return { ...saved, stepId, cached: false, fallback: "template", contactName: contact.full_name, sequenceName: sequence.name };
      }
    }
    return { error: error instanceof Error ? error.message : "Could not write this email" };
  }
}

async function runTool(ctx: AgentToolContext, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "list_contacts":
      return listContacts(ctx.db, ctx.userId, args);
    case "list_prospect_companies":
      return listProspectCompanies(ctx.db, ctx.userId, args);
    case "get_sequence_overview":
      return getSequenceOverview(ctx.db, ctx.userId, args as { sequenceId?: string });
    case "draft_outreach_email":
      return draftEmail(ctx, args);
    default:
      throw new Error(`Unknown Writer tool: ${name}`);
  }
}

export const writer: SpecialistModule = {
  id: "writer",
  instruction,
  tools: [...WRITER_TOOLS],
  runTool,
};
