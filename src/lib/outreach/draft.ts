import { getAiClient } from "@/lib/ai/openai";
import { safeAiErrorMessage } from "@/lib/ai/errors";
import { EMAIL_SKILL_BRIEF } from "@/lib/outreach/email-skills";

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

/**
 * Vertex opener draft — Mom Test / non-salesy voice (OpenOutSend outreach agent).
 */
export async function draftOpener(ctx: DraftContext): Promise<OutreachDraft> {
  const prompt = `${EMAIL_SKILL_BRIEF}

You write a first cold outreach email as a curious peer doing Mom Test research — not a pitch.
Return ONLY JSON: {"subject":"...","body":"..."}.
Rules:
- Subject: short, specific, human — not salesy, no ALL CAPS, no clickbait.
- Body: a few short sentences, plain text, no signature block, no links unless essential.
- Ask one genuine question about their world; do not push a demo or pricing.
- Use the qualify reason if present as the reason you're reaching out.
- Never invent facts about the recipient.

Sender: ${ctx.senderName ?? "the sender"}
Recipient: ${ctx.contactName ?? "there"}${ctx.contactTitle ? ` (${ctx.contactTitle})` : ""} at ${ctx.companyName} (${ctx.companyDomain})
Email: ${ctx.contactEmail}
Why they fit: ${ctx.qualifyReason ?? "(none — keep generic but relevant)"}
Campaign: ${ctx.campaignName ?? "(none)"}
Pain this campaign speaks to: ${ctx.campaignPain ?? "(none)"}
Our product (context only, do not hard-sell): ${ctx.productSummary ?? "(unspecified)"}`;

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
  campaignName?: string | null;
  campaignPain?: string | null;
  campaignDescription?: string | null;
  productSummary?: string | null;
  senderName?: string | null;
  stepNumber: number;
  delayDays: number;
  previousSubject?: string | null;
  previousBody?: string | null;
}

/**
 * Generic (template) follow-up draft — used once per campaign step, not per contact.
 * Uses {{first_name}} / {{company}} placeholders so it can be rendered per recipient later.
 */
export async function draftFollowupTemplate(ctx: FollowupContext): Promise<OutreachDraft> {
  const prompt = `${EMAIL_SKILL_BRIEF}

You write follow-up bump #${ctx.stepNumber} in a cold outreach sequence, sent ${ctx.delayDays} day(s) after the previous email if there was no reply.
Return ONLY JSON: {"subject":"...","body":"..."}.
Rules:
- This is a TEMPLATE reused for many recipients — use exactly the placeholders {{first_name}} and {{company}} where a name/company would go. Do not invent specific facts.
- Short, low-pressure bump. Reference that you reached out before without repeating it verbatim.
- Plain text, no signature block, no links unless essential. A few short sentences.
- Do not be salesy or pushy. One new angle or data point — not a rehash of the opener.

Sender: ${ctx.senderName ?? "the sender"}
Campaign: ${ctx.campaignName ?? "(none)"}
Pain this campaign speaks to: ${ctx.campaignPain ?? "(none)"}
Campaign description: ${ctx.campaignDescription ?? "(none)"}
Our product (context only, do not hard-sell): ${ctx.productSummary ?? "(unspecified)"}
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

/** Fill {{first_name}} / {{company}} style templates when AI draft is not used. */
export function renderTemplate(
  template: string,
  vars: Record<string, string | null | undefined>
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}
