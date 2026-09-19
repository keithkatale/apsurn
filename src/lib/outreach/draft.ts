import { getAiClient } from "@/lib/ai/openai";
import { safeAiErrorMessage } from "@/lib/ai/errors";

export interface DraftContext {
  contactName: string | null;
  contactTitle: string | null;
  contactEmail: string;
  companyName: string;
  companyDomain: string;
  qualifyReason: string | null;
  productSummary: string | null;
  senderName?: string | null;
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
  const prompt = `You write a first cold outreach email as a curious peer doing Mom Test research — not a pitch.
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

/** Fill {{first_name}} / {{company}} style templates when AI draft is not used. */
export function renderTemplate(
  template: string,
  vars: Record<string, string | null | undefined>
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}
