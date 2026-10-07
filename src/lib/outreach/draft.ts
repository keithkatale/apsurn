import { getAiClient } from "@/lib/ai/openai";
import { safeAiErrorMessage } from "@/lib/ai/errors";
import { EMAIL_SKILL_BRIEF } from "@/lib/outreach/email-skills";
import { planEmail, type EmailPlan } from "@/lib/skills/angles";
import { formatBusinessContext, loadBusinessContext, type BusinessContext } from "@/lib/skills/business-context";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DraftContext {
  contactName: string | null;
  contactTitle: string | null;
  contactEmail: string;
  companyName: string;
  companyDomain: string;
  qualifyReason: string | null;
  productSummary: string | null;
  senderName?: string | null;
  campaignName?: string | null;
  campaignPain?: string | null;
  /** When set, the draft is grounded in this user's blueprint and brand documents. */
  userId?: string;
  /** Seeds the angle so each recipient gets a different structure. */
  contactId?: string;
  /** Bump to get a different take on regenerate. */
  variant?: number;
  /** Everything known about this lead (see lead-context.ts). The email must be built from it. */
  leadDossier?: string;
  leadHasSpecifics?: boolean;
}

export interface OutreachDraft {
  subject: string;
  body: string;
}

function extractJsonObject(text: string): unknown {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Model did not return valid JSON");
  }
}

async function groundedPrompt(opts: {
  userId?: string;
  seed: string;
  stepNumber: number;
  contactTitle?: string | null;
  hasSignal: boolean;
}): Promise<{ business: BusinessContext | null; plan: EmailPlan | null; text: string }> {
  if (!opts.userId) return { business: null, plan: null, text: "" };
  try {
    const business = await loadBusinessContext(createAdminClient(), opts.userId);
    const plan = planEmail({
      seed: opts.seed,
      stepNumber: opts.stepNumber,
      business,
      contactTitle: opts.contactTitle,
      hasSignal: opts.hasSignal,
    });
    const text = `BUSINESS CONTEXT (facts about the sender; the only source for claims about them)
${formatBusinessContext(business, plan.persona) || "(blueprint not available)"}

EMAIL PLAN (follow it so this email differs from others in the campaign)
- Structure: ${plan.framework}. ${plan.frameworkHow}
- Angle: ${plan.angle}
- Opening move: ${plan.opening}
- The ask: ${plan.ask}
- Length: ${plan.length}`;
    return { business, plan, text };
  } catch {
    return { business: null, plan: null, text: "" };
  }
}

/**
 * Vertex opener draft — Mom Test / non-salesy voice (OpenOutSend outreach agent).
 */
export async function draftOpener(ctx: DraftContext): Promise<OutreachDraft> {
  const grounded = await groundedPrompt({
    userId: ctx.userId,
    seed: `${ctx.contactId ?? ctx.contactEmail}:1:${ctx.variant ?? 0}`,
    stepNumber: 1,
    contactTitle: ctx.contactTitle,
    hasSignal: Boolean(ctx.qualifyReason),
  });

  const prompt = `${EMAIL_SKILL_BRIEF}

You write the FIRST cold email to one specific person, as a thoughtful peer, not a pitch deck.
Return ONLY JSON: {"subject":"...","body":"..."}.
WRITE FOR THIS ONE PERSON
- Nobody else will receive this exact email. Build it from the LEAD DOSSIER: their role, their company, what is publicly known about them, and the signal that made them a lead. Open with something true about THEM, not about the sender.
- The campaign pain and the business context are background for you, not copy. Never paste or lightly rephrase a sentence from them (no taglines, no "we partner with…", no positioning statements, no generic messaging lines).
- If the dossier has little beyond a name and role, keep the email short and honest about why you are writing to someone in that role at that kind of company. Do not pad it with generic claims, and never invent a detail about them.
Rules:
- Subject: 2 to 5 words, specific and human, lowercase is fine, no clickbait, no prospect name.
- Body: plain text, short paragraphs, no signature block, no links unless essential.
- Use the qualify reason, when present, as the true reason you are writing. Otherwise connect their role to the problem in the EMAIL PLAN.
- One ask only. Do not push a demo or pricing on the first touch.
- Never invent facts about the recipient or the sender.
- Where you would write the recipient's first name, full name, title, email, company, or domain, use exactly these tokens: {{first_name}}, {{full_name}}, {{title}}, {{email}}, {{company}}, {{domain}}. Do not hardcode their real values.

${grounded.text}

LEAD DOSSIER (everything known about this recipient; the only source for claims about them)
${ctx.leadDossier || "(nothing beyond the name, role and company below)"}

Sender: ${ctx.senderName ?? "the sender"}
Recipient: ${ctx.contactName ?? "there"}${ctx.contactTitle ? ` (${ctx.contactTitle})` : ""} at ${ctx.companyName} (${ctx.companyDomain})
Email: ${ctx.contactEmail}
Why they fit: ${ctx.qualifyReason ?? "(none, so stay relevant through their role and the campaign pain)"}
Campaign: ${ctx.campaignName ?? "(none)"}
Pain this campaign speaks to (background only, never copy it): ${ctx.campaignPain ?? "(none)"}
${grounded.business ? "" : `Our product (context only): ${ctx.productSummary ?? "(unspecified)"}`}`;

  try {
    const { ai, model } = await getAiClient();
    const response = await ai.responses.create({
      model,
      input: prompt,
    });
    const parsed = extractJsonObject(response.output_text ?? "") as OutreachDraft;
    const subject = String(parsed.subject ?? "").trim();
    const body = String(parsed.body ?? "").trim();
    if (!subject || !body) throw new Error("empty draft");
    return { subject, body };
  } catch (error) {
    throw new Error(`Outreach draft failed: ${safeAiErrorMessage(error)}`);
  }
}

export interface FollowupContext {
  contactName?: string | null;
  contactTitle?: string | null;
  companyName?: string | null;
  companyDomain?: string | null;
  campaignName?: string | null;
  campaignPain?: string | null;
  campaignDescription?: string | null;
  productSummary?: string | null;
  senderName?: string | null;
  stepNumber: number;
  delayDays: number;
  previousSubject?: string | null;
  previousBody?: string | null;
  userId?: string;
  contactId?: string;
  variant?: number;
  leadDossier?: string;
  leadHasSpecifics?: boolean;
}

/**
 * Per-contact follow-up draft. Uses {{first_name}} / {{company}} (and related) tokens
 * so the UI can render live chips from the lead profile.
 */
export async function draftFollowupForContact(ctx: FollowupContext): Promise<OutreachDraft> {
  const grounded = await groundedPrompt({
    userId: ctx.userId,
    seed: `${ctx.contactId ?? ctx.companyName ?? "x"}:${ctx.stepNumber}:${ctx.variant ?? 0}`,
    stepNumber: ctx.stepNumber,
    contactTitle: ctx.contactTitle,
    hasSignal: false,
  });

  const prompt = `${EMAIL_SKILL_BRIEF}

You write follow-up #${ctx.stepNumber} in a cold outreach sequence for ONE recipient, sent ${ctx.delayDays} day(s) after the previous email if there was no reply.
Return ONLY JSON: {"subject":"...","body":"..."}.
Rules:
- Where you would write the recipient's first name, full name, title, email, company, or domain, use exactly these tokens: {{first_name}}, {{full_name}}, {{title}}, {{email}}, {{company}}, {{domain}}. Do not hardcode their real values.
- It must stand alone and add something NEW: follow the angle in the EMAIL PLAN. Never "just checking in" and never a rehash of the previous email.
- Short and low pressure. Plain text, no signature block, no links unless essential.
- If this is the last email in the sequence, make it a polite breakup.

WRITE FOR THIS ONE PERSON
- Nobody else will receive this exact email. Build it from the LEAD DOSSIER: their role, their company, what is publicly known about them, and the signal that made them a lead. Open with something true about THEM, not about the sender.
- The campaign pain and the business context are background for you, not copy. Never paste or lightly rephrase a sentence from them (no taglines, no "we partner with…", no positioning statements, no generic messaging lines).
- If the dossier has little beyond a name and role, keep the email short and honest about why you are writing to someone in that role at that kind of company. Do not pad it with generic claims, and never invent a detail about them.

${grounded.text}

LEAD DOSSIER (everything known about this recipient; the only source for claims about them)
${ctx.leadDossier || "(nothing beyond the name, role and company below)"}

Sender: ${ctx.senderName ?? "the sender"}
Recipient: ${ctx.contactName ?? "there"}${ctx.contactTitle ? ` (${ctx.contactTitle})` : ""} at ${ctx.companyName ?? "their company"}${ctx.companyDomain ? ` (${ctx.companyDomain})` : ""}
Campaign: ${ctx.campaignName ?? "(none)"}
Pain this campaign speaks to: ${ctx.campaignPain ?? "(none)"}
Campaign description: ${ctx.campaignDescription ?? "(none)"}
${grounded.business ? "" : `Our product (context only): ${ctx.productSummary ?? "(unspecified)"}`}
Previous email subject: ${ctx.previousSubject ?? "(unknown)"}
Previous email body: ${ctx.previousBody ?? "(unknown)"}`;

  try {
    const { ai, model } = await getAiClient();
    const response = await ai.responses.create({
      model,
      input: prompt,
    });
    const parsed = extractJsonObject(response.output_text ?? "") as OutreachDraft;
    const subject = String(parsed.subject ?? "").trim();
    const body = String(parsed.body ?? "").trim();
    if (!subject || !body) throw new Error("empty draft");
    return { subject, body };
  } catch (error) {
    throw new Error(`Follow-up draft failed: ${safeAiErrorMessage(error)}`);
  }
}

/** @deprecated use draftFollowupForContact */
export async function draftFollowupTemplate(ctx: FollowupContext): Promise<OutreachDraft> {
  return draftFollowupForContact(ctx);
}

/** Fill {{first_name}} / {{company}} style templates when AI draft is not used. */
export function renderTemplate(
  template: string,
  vars: Record<string, string | null | undefined>
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}
