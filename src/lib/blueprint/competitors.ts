import { getAiClient } from "@/lib/ai/openai";
import { safeAiErrorMessage } from "@/lib/ai/errors";

function extractJsonArray(text: string): unknown {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Model did not return a valid JSON array");
  }
}

/**
 * Grounds competitor discovery in real Google Search results (Gemini's
 * built-in search-grounding tool) rather than relying on the model's
 * training-data recall, which is unreliable for "who competes with X"
 * questions. Kept as its own call — combining search grounding with
 * `responseMimeType: "application/json"` isn't reliably supported, so the
 * main blueprint call stays JSON-mode-only and this one asks for JSON as
 * plain text instead.
 */
export async function findCompetitors(params: {
  companyName: string | null;
  productSummary: string | null;
  positioning?: string | null;
  valueProp?: string | null;
  industries: string[];
}): Promise<string[]> {
  const { companyName, productSummary, positioning, valueProp, industries } = params;
  if (!companyName && !productSummary) return [];

  const prompt = `Using web search, find real companies that offer a similar service or product to this business — direct competitors and close alternatives in the same category.

Company name: ${companyName ?? "unknown"}
What they do: ${productSummary ?? "unknown"}
Positioning: ${positioning ?? "unknown"}
Value: ${valueProp ?? "unknown"}
Industries: ${industries.join(", ") || "unknown"}

Return ONLY a JSON array of competitor names or domains (max 12), no markdown fences, no commentary. Example: ["Competitor One", "othertool.io"]. If you can't find any real companies, return [].`;

  try {
    const { ai, model } = await getAiClient();
    const response = await ai.responses.create({
      model,
      input: prompt,
      max_output_tokens: 1024,
      tools: [{ type: "web_search" }],
    });

    const parsed = extractJsonArray(response.output_text ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 12);
  } catch (err) {
    console.error(`[blueprint] competitor search failed: ${safeAiErrorMessage(err)}`);
    return [];
  }
}

