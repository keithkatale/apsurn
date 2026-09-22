import { getAiClient } from "@/lib/ai/openai";
import { safeAiErrorMessage } from "@/lib/ai/errors";
import { EMAIL_SKILL_BRIEF } from "@/lib/outreach/email-skills";
import type { CampaignDefinition } from "./campaign-templates";

export interface CampaignEmailSteps {
  name: string;
  description: string;
  pain: string;
  targeting: string[];
  sampleAccounts: string[];
  estimatedVolume: number;
  segmentKey: string;
  outreachMethod: string;
  steps: Array<{
    subject_template: string;
    body_template: string;
    delay_days: number;
    stop_on_reply: boolean;
  }>;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function writeCampaignEmails(
  campaign: CampaignDefinition,
  context: {
    senderName: string;
    companyName: string | null;
    productSummary: string | null;
    valueProp: string | null;
  }
): Promise<CampaignEmailSteps> {
  const fallback = defaultCopy(campaign, context);
  const prompt = `${EMAIL_SKILL_BRIEF}

Write the opener email for a ${campaign.outreachMethod} campaign for ${context.companyName ?? "this company"} (follow-ups are added later on the canvas).

Sender first name: ${context.senderName}
Product: ${context.productSummary ?? "unknown"}
Value: ${context.valueProp ?? "unknown"}
Campaign: ${campaign.name}
What it does: ${campaign.description}
Pain: ${campaign.pain}
Targeting: ${campaign.targeting.join("; ")}

Tone: concise, specific, not salesy. Use {{first_name}} and {{company}} placeholders.
Return ONLY JSON:
{"openerSubject":"...","openerBody":"plain text"}`;

  try {
    const { ai, model } = await getAiClient();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    const response = await ai.responses.create(
      { model, input: prompt, max_output_tokens: 700 },
      { signal: controller.signal },
    );
    clearTimeout(timer);
    const parsed = extractJsonObject(response.output_text ?? "");
    if (!parsed) return fallback;
    const openerSubject = typeof parsed.openerSubject === "string" ? parsed.openerSubject.trim() : fallback.steps[0].subject_template;
    const openerBody = typeof parsed.openerBody === "string" ? parsed.openerBody.trim() : fallback.steps[0].body_template;
    return {
      ...campaign,
      steps: [
        { subject_template: openerSubject.slice(0, 200), body_template: openerBody.slice(0, 4000), delay_days: 0, stop_on_reply: true },
      ],
    };
  } catch (error) {
    console.error("[onboarding] campaign copy failed:", safeAiErrorMessage(error));
    return fallback;
  }
}

export function defaultCopy(
  campaign: CampaignDefinition,
  context: { senderName: string; companyName: string | null; valueProp: string | null }
): CampaignEmailSteps {
  const brand = context.companyName ?? "us";
  return {
    ...campaign,
    steps: [
      {
        subject_template: `{{company}} × ${brand}`,
        body_template: `Hi {{first_name}},\n\n${campaign.pain}.\n\n${context.valueProp ?? campaign.description}\n\nIf useful I can share how teams like yours handle this in 30 days.\n\n${context.senderName}`,
        delay_days: 0,
        stop_on_reply: true,
      },
    ],
  };
}
