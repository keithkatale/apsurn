import type { ConnectedInbox } from "@/lib/inbox/gmail";
import { enqueueInternalJob } from "@/lib/jobs/enqueue";
import { checkSendGuards } from "@/lib/outreach/guards";
import { resolveMergeFields } from "@/lib/outreach/merge-fields";
import { getOwnedContact } from "@/lib/outreach/owned-contact";
import { runOutreachSendPass } from "@/lib/outreach/pass";
import { sendViaInbox } from "@/lib/outreach/send";
import { archiveProspectCompanies, updateContacts } from "@/lib/prospecting/mutations";
import { fallbackCampaigns } from "@/lib/onboarding/campaign-templates";
import { defaultCopy } from "@/lib/onboarding/generate-campaign-copy";
import { createSequence, enrollContacts } from "@/lib/sequences/mutations";
import { publishArtifact } from "@/lib/copilot/artifacts";
import { getSequenceOverview, listContacts, listProspectCompanies } from "./shared";
import type { AgentToolContext, SpecialistModule } from "./types";

const instruction = `You are Operator, apsurn's pipeline specialist.

You change lead status, archive records, create sequences, enroll contacts, activate a sequence, and send email.

Rules:
- You talk to Copilot, not the user. Never invent IDs. Look up contacts and sequences by name first.
- Listing contacts, companies, or sequences is a read — do it immediately. Do not ask Copilot to confirm a lookup.
- Creating a sequence does not require contacts. Write the subject and body yourself from the briefing (ICP, personas, value prop, positioning). Call create_sequence with those steps. Never ask the user or Copilot to supply email copy.
- If the task also needs people to enroll or draft and list_contacts / list_prospect_companies are empty, create the sequence anyway and say the pipeline is empty so Copilot can have Researcher pull leads. Do not ask the user to wait or pick a contact.
- archive_* only when the user asked to remove/archive those records.
- run_send_pass and send_email_now require confirmed=true. If the task does not say the user confirmed, refuse and tell Copilot to ask.
- Do not start prospecting or rewrite the ICP.`;

export const OPERATOR_TOOLS = [
  {
    name: "list_contacts",
    description: "Find contacts by name, email, lead status, or company.",
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
    description: "List prospected companies already in the account.",
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
    description: "List sequences or get one sequence's steps and enrollments.",
    parameters: {
      type: "object",
      properties: { sequenceId: { type: "string" } },
    },
  },
  {
    name: "update_contact_status",
    description: "Change lead_status on one or more contacts by id.",
    parameters: {
      type: "object",
      properties: {
        contactIds: { type: "array", items: { type: "string" }, minItems: 1 },
        leadStatus: { type: "string", enum: ["new", "qualified", "contacted", "replied", "won", "lost"] },
      },
      required: ["contactIds", "leadStatus"],
    },
  },
  {
    name: "archive_contacts",
    description: "Soft-delete contacts by id. Confirm with the user first unless they already asked to delete them.",
    parameters: {
      type: "object",
      properties: { contactIds: { type: "array", items: { type: "string" }, minItems: 1 } },
      required: ["contactIds"],
    },
  },
  {
    name: "archive_prospect_companies",
    description: "Soft-delete prospected companies (and their contacts) by id.",
    parameters: {
      type: "object",
      properties: { companyIds: { type: "array", items: { type: "string" }, minItems: 1 } },
      required: ["companyIds"],
    },
  },
  {
    name: "create_sequence",
    description: "Create a draft outreach sequence with one or more email steps.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        steps: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              subject_template: { type: "string" },
              body_template: { type: "string" },
              delay_days: { type: "number" },
            },
            required: ["body_template"],
          },
        },
      },
      required: ["name", "steps"],
    },
  },
  {
    name: "enroll_contacts",
    description: "Enroll contacts into a sequence. Contacts without email or archived are skipped.",
    parameters: {
      type: "object",
      properties: {
        sequenceId: { type: "string" },
        contactIds: { type: "array", items: { type: "string" }, minItems: 1 },
      },
      required: ["sequenceId", "contactIds"],
    },
  },
  {
    name: "activate_sequence",
    description: "Set a sequence to active and optionally attach a connected inbox (defaults to the user's first inbox).",
    parameters: {
      type: "object",
      properties: {
        sequenceId: { type: "string" },
        inboxId: { type: "string" },
      },
      required: ["sequenceId"],
    },
  },
  {
    name: "run_send_pass",
    description: "Queue one outreach send-pass for due enrollments. Requires confirmed=true after the user said to send.",
    parameters: {
      type: "object",
      properties: {
        confirmed: { type: "boolean" },
        limit: { type: "number" },
      },
      required: ["confirmed"],
    },
  },
  {
    name: "send_email_now",
    description: "Send one email immediately. Requires confirmed=true. Uses a provided subject/body or the saved draft.",
    parameters: {
      type: "object",
      properties: {
        confirmed: { type: "boolean" },
        contactId: { type: "string" },
        sequenceId: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["confirmed", "contactId"],
    },
  },
] as const;

async function firstInbox(ctx: AgentToolContext, inboxId?: string) {
  let q = ctx.db
    .from("connected_inboxes")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1);
  if (inboxId) q = ctx.db.from("connected_inboxes").select("*").eq("user_id", ctx.userId).eq("id", inboxId).eq("status", "connected").limit(1);
  const { data } = await q.maybeSingle();
  return data;
}

async function activateSequence(ctx: AgentToolContext, args: Record<string, unknown>) {
  const sequenceId = String(args.sequenceId);
  const { data: sequence } = await ctx.db.from("sequences").select("id, from_inbox_id, status").eq("id", sequenceId).eq("user_id", ctx.userId).maybeSingle();
  if (!sequence) return { error: "Sequence not found." };
  const inbox = await firstInbox(ctx, typeof args.inboxId === "string" ? args.inboxId : undefined);
  const patch: { status: string; from_inbox_id?: string } = { status: "active" };
  if (inbox?.id) patch.from_inbox_id = inbox.id;
  const { error } = await ctx.db.from("sequences").update(patch).eq("id", sequenceId).eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  return {
    ok: true,
    sequenceId,
    status: "active",
    fromInboxId: patch.from_inbox_id ?? sequence.from_inbox_id,
    warning: inbox ? undefined : "No connected inbox — attach Gmail in Settings before sending.",
  };
}

async function runSendPass(ctx: AgentToolContext, args: Record<string, unknown>) {
  if (args.confirmed !== true) {
    return { error: "Sending needs an explicit yes from the user. Ask Copilot to confirm first.", needsConfirmation: true };
  }
  const limit = typeof args.limit === "number" ? Math.min(50, Math.max(1, Math.floor(args.limit))) : undefined;
  enqueueInternalJob(
    "/api/cron/outreach-send-pass",
    { userId: ctx.userId },
    () => runOutreachSendPass({ userId: ctx.userId, limit }),
  );
  return { queued: true, limit: limit ?? 10 };
}

async function sendNow(ctx: AgentToolContext, args: Record<string, unknown>) {
  if (args.confirmed !== true) {
    return { error: "Sending needs an explicit yes from the user. Ask Copilot to confirm first.", needsConfirmation: true };
  }
  const inbox = await firstInbox(ctx);
  if (!inbox) return { error: "Connect Gmail to send as you.", code: "no_inbox" };

  const contact = await getOwnedContact(ctx.db, ctx.userId, String(args.contactId));
  if (!contact) return { error: "Contact not found." };
  if (!contact.email) return { error: "This contact has no email yet." };

  let subject = typeof args.subject === "string" ? args.subject.trim() : "";
  let body = typeof args.body === "string" ? args.body.trim() : "";
  const sequenceId = typeof args.sequenceId === "string" ? args.sequenceId : undefined;

  if ((!subject || !body) && sequenceId) {
    const { data: draft } = await ctx.db
      .from("outreach_drafts")
      .select("subject, body")
      .eq("user_id", ctx.userId)
      .eq("contact_id", contact.id)
      .eq("sequence_id", sequenceId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    subject = subject || draft?.subject || "";
    body = body || draft?.body || "";
  }
  if (!subject || !body) return { error: "Need a subject and body, or a saved draft on that sequence." };

  const guards = await checkSendGuards({ email: contact.email, inboxId: inbox.id, ignoreWindow: true });
  if (!guards.ok) {
    return {
      error: guards.reason === "daily_cap" ? "Daily send cap reached" : guards.reason === "suppressed" ? "This address is suppressed" : "Cannot send this email",
      code: guards.reason,
    };
  }

  const leadSource = {
    fullName: contact.full_name,
    title: contact.title,
    email: contact.email,
    companyName: contact.company.name,
    companyDomain: contact.company.domain,
  };
  const resolvedSubject = resolveMergeFields(subject, leadSource);
  const resolvedBody = resolveMergeFields(body, leadSource);

  let enrollmentId: string | null = null;
  let stepId: string | null = null;
  let threadId: string | null = null;
  let currentStep = 0;

  if (sequenceId) {
    const { data: sequence } = await ctx.db
      .from("sequences")
      .select("id, from_inbox_id, sequence_steps(id, step_order)")
      .eq("id", sequenceId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (sequence) {
      const step = [...(sequence.sequence_steps ?? [])].sort((a, b) => a.step_order - b.step_order)[0];
      stepId = step?.id ?? null;
      if (!sequence.from_inbox_id) {
        await ctx.db.from("sequences").update({ from_inbox_id: inbox.id, status: "active" }).eq("id", sequence.id);
      }
      const enrolled = await enrollContacts(ctx.db, ctx.userId, sequence.id, [contact.id]);
      if (enrolled.ok) {
        const { data: enrollment } = await ctx.db
          .from("enrollments")
          .select("id, thread_id, current_step")
          .eq("sequence_id", sequence.id)
          .eq("contact_id", contact.id)
          .maybeSingle();
        if (enrollment) {
          enrollmentId = enrollment.id;
          threadId = enrollment.thread_id;
          currentStep = enrollment.current_step;
        }
      }
    }
  }

  let pendingSendId: string | null = null;
  if (enrollmentId && stepId) {
    const { data: pendingSend } = await ctx.db
      .from("email_sends")
      .insert({ enrollment_id: enrollmentId, sequence_step_id: stepId, subject: resolvedSubject, body: resolvedBody, status: "pending" })
      .select("id")
      .single();
    pendingSendId = pendingSend?.id ?? null;
  }

  const sent = await sendViaInbox(inbox as ConnectedInbox, {
    to: contact.email,
    subject: resolvedSubject,
    body: resolvedBody,
    threadId,
  });

  const now = new Date().toISOString();
  if (pendingSendId) {
    await ctx.db
      .from("email_sends")
      .update({ status: "sent", sent_at: now, provider_message_id: sent.providerMessageId, thread_id: sent.threadId })
      .eq("id", pendingSendId);
  }
  if (enrollmentId) {
    if (pendingSendId) {
      await ctx.db.from("email_events").insert({
        email_send_id: pendingSendId,
        enrollment_id: enrollmentId,
        type: "sent",
        metadata: { provider: inbox.provider, manual: true, source: "operator" },
        occurred_at: now,
      });
    }
    await ctx.db
      .from("enrollments")
      .update({ current_step: Math.max(currentStep, 1), thread_id: sent.threadId, status: "active" })
      .eq("id", enrollmentId);
  }

  return { sent: true, threadId: sent.threadId, from: inbox.email_address, contactName: contact.full_name };
}

export async function createSequenceFromBlueprint(ctx: AgentToolContext) {
  const { data: company } = await ctx.db.from("companies").select("id, name").eq("user_id", ctx.userId).maybeSingle();
  if (!company) return { error: "Set up your company first." };
  const { data: blueprint } = await ctx.db
    .from("company_blueprints")
    .select("icp, personas, value_prop, positioning, product_summary, approved_at")
    .eq("company_id", company.id)
    .maybeSingle();
  if (!blueprint?.approved_at) return { error: "Approve the blueprint in setup before creating a sequence." };

  const icp = blueprint.icp && typeof blueprint.icp === "object" ? (blueprint.icp as { industries?: string[]; companySizeRange?: string; geographies?: string[] }) : {};
  const personas = Array.isArray(blueprint.personas) ? (blueprint.personas as Array<{ title?: string; painPoints?: string[] }>) : [];
  const campaign = fallbackCampaigns({
    personas,
    icp,
    competitors: [],
    productSummary: blueprint.product_summary ?? blueprint.value_prop,
  })[0];
  const senderName = String(company.name ?? "there").split(/\s+/)[0] || "there";
  const written = defaultCopy(campaign, {
    senderName,
    companyName: company.name,
    valueProp: blueprint.value_prop ?? blueprint.positioning ?? blueprint.product_summary,
  });
  const persona = personas[0]?.title || "your buyer";
  const steps = [
    written.steps[0],
    {
      subject_template: `Re: {{company}}`,
      body_template: `Hi {{first_name}},\n\nFollowing up on the note above. ${written.pain}\n\nWorth a short look this week?\n\n${senderName}`,
      delay_days: 3,
      stop_on_reply: true,
    },
    {
      subject_template: `Closing the loop, {{first_name}}`,
      body_template: `Hi {{first_name}},\n\nI will leave this here. If ${persona.toLowerCase()} priorities change, I can send a tighter plan for {{company}}.\n\n${senderName}`,
      delay_days: 4,
      stop_on_reply: true,
    },
  ];
  return runTool(ctx, "create_sequence", { name: `${campaign.name} — ${company.name ?? "ICP"}`, steps });
}

async function runTool(ctx: AgentToolContext, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "list_contacts":
      return listContacts(ctx.db, ctx.userId, args);
    case "list_prospect_companies":
      return listProspectCompanies(ctx.db, ctx.userId, args);
    case "get_sequence_overview":
      return getSequenceOverview(ctx.db, ctx.userId, args as { sequenceId?: string });
    case "update_contact_status":
      return updateContacts(ctx.db, ctx.userId, args.contactIds as string[], {
        leadStatus: args.leadStatus as "new" | "qualified" | "contacted" | "replied" | "won" | "lost",
      });
    case "archive_contacts":
      return updateContacts(ctx.db, ctx.userId, args.contactIds as string[], { archived: true });
    case "archive_prospect_companies":
      return archiveProspectCompanies(ctx.db, ctx.userId, args.companyIds as string[]);
    case "create_sequence": {
      const input = args as { name: string; steps: { body_template: string; subject_template?: string; delay_days?: number }[] };
      const created = await createSequence(ctx.db, ctx.userId, input);
      if (!created.ok) return created;
      const { data: stepRows } = await ctx.db
        .from("sequence_steps")
        .select("id, step_order, delay_days, subject_template, body_template")
        .eq("sequence_id", created.data.sequenceId)
        .order("step_order", { ascending: true });
      const steps = (stepRows ?? []).map((step) => ({
        id: step.id,
        stepOrder: step.step_order,
        delayDays: step.delay_days,
        subject: step.subject_template,
        body: step.body_template,
      }));
      const artifact = await publishArtifact(ctx, {
        kind: "sequence",
        title: input.name,
        payload: { sequenceId: created.data.sequenceId, name: input.name, status: "draft", steps },
      });
      return { ok: true, sequenceId: created.data.sequenceId, name: input.name, steps, artifactId: artifact?.id };
    }
    case "enroll_contacts":
      return enrollContacts(ctx.db, ctx.userId, args.sequenceId as string, args.contactIds as string[]);
    case "activate_sequence":
      return activateSequence(ctx, args);
    case "run_send_pass":
      return runSendPass(ctx, args);
    case "send_email_now":
      return sendNow(ctx, args);
    default:
      throw new Error(`Unknown Operator tool: ${name}`);
  }
}

export const operator: SpecialistModule = {
  id: "operator",
  instruction,
  tools: [...OPERATOR_TOOLS],
  runTool,
};
