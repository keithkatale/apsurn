import { createGenAIClient, getAiModel } from "@/lib/ai/vertex";
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
  industries: string[];
}): Promise<string[]> {
  const { companyName, productSummary, industries } = params;
  if (!companyName && !productSummary) return [];

  const prompt = `Using web search, find real, named competitors for this company.

Company name: ${companyName ?? "unknown"}
What they do: ${productSummary ?? "unknown"}
Industries: ${industries.join(", ") || "unknown"}

Return ONLY a JSON array of competitor company names (max 8), no markdown fences, no commentary. Example: ["Competitor One", "Competitor Two"]. If you can't find any real competitors, return [].`;

  try {
    const ai = createGenAIClient();
    const response = await ai.models.generateContent({
      model: getAiModel(),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2,
        maxOutputTokens: 1024,
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const parsed = extractJsonArray(response.text ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 8);
  } catch (err) {
    console.error(`[blueprint] competitor search failed: ${safeAiErrorMessage(err)}`);
    return [];
  }
}
