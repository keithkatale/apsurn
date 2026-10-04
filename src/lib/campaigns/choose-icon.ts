import { getAiClient } from "@/lib/ai/openai";
import { generateCampaignIconSvg, MATERIAL_ICON_NAMES, readMaterialIcon, type CampaignIconInput } from "@/lib/campaigns/icon";

/** Ask the model to pick a Material Symbol from the campaign and its leads. Keyword match is the fallback. */
export async function chooseCampaignIcon(input: CampaignIconInput & { sample?: string | null }): Promise<string> {
  const fallback = generateCampaignIconSvg(input);
  try {
    const { ai, model } = await getAiClient();
    const response = await ai.responses.create({
      model,
      input: `Choose one Google Material Symbol for a B2B outbound campaign sidebar.
Allowed names, and nothing else: ${MATERIAL_ICON_NAMES.join(", ")}

Name: ${input.name ?? ""}
What the campaign is about: ${input.description ?? ""}
Who is on the list: ${input.sample ?? ""}

Return only the icon name.`,
      max_output_tokens: 24,
    });
    const raw = (response.output_text ?? "").trim().toLowerCase().split(/\s+/)[0] ?? "";
    const stored = readMaterialIcon(raw.startsWith("mi:") ? raw : `mi:${raw.replace(/[^a-z0-9_]/g, "")}`);
    if (stored) return `mi:${stored}`;
  } catch {
    /* keyword match still produces a Google icon */
  }
  return fallback;
}
