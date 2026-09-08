import { createGenAIClient, getAiModel } from "@/lib/ai/vertex";
import type { SiteSnapshot } from "@/lib/scraper/crawl";
import { findCompetitors } from "./competitors";
import { sanitizeBlueprint } from "./sanitize";
import type { CompanyBlueprint } from "./types";
import { safeAiErrorMessage } from "@/lib/ai/errors";

const MODEL_TIMEOUT_MS = 50_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
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

function buildPrompt(snapshot: SiteSnapshot): string {
  const pagesText = snapshot.pages
    .map((p) => `## ${p.title || p.url}\n(${p.url})\n${p.text}`)
    .join("\n\n");

  return `You are analyzing a B2B SaaS company's website to build a sales blueprint for their outbound prospecting.

Below is scraped text from their website (homepage + key pages):

${pagesText}

Return ONLY JSON (no markdown fences, no commentary) matching exactly this shape:
{
  "companyName": string | null,
  "icp": {
    "industries": string[],       // industries this company's product best fits
    "companySizeRange": string,    // e.g. "11-50 employees"
    "geographies": string[],       // target regions/countries, best guess
    "budgetSignals": string[]      // signals suggesting buying budget, e.g. "recently raised funding"
  },
  "personas": [
    { "title": string, "seniority": string, "painPoints": string[], "goals": string[] }
  ],
  "valueProp": string | null,
  "positioning": string | null,
  "productSummary": string | null,
  "competitors": string[]
}

Base every field only on what's reasonably inferable from the scraped text. If something can't be inferred, use null or an empty array rather than guessing wildly.`;
}

/** Deterministic fallback used when the model call fails or times out. */
function fallbackBlueprint(snapshot: SiteSnapshot): CompanyBlueprint {
  const title = snapshot.pages[0]?.title || null;
  return sanitizeBlueprint(
    {
      companyName: title,
      icp: {
        industries: [],
        companySizeRange: "Unknown",
        geographies: [],
        budgetSignals: [],
      },
      personas: [],
      valueProp: null,
      positioning: null,
      productSummary: snapshot.pages[0]?.text.slice(0, 300) ?? null,
      competitors: [],
    },
    { confidence: "heuristic_fallback", modelUsed: null }
  );
}

export async function generateCompanyBlueprint(snapshot: SiteSnapshot): Promise<CompanyBlueprint> {
  const model = getAiModel();
  try {
    const ai = createGenAIClient();
    const prompt = buildPrompt(snapshot);
    const response = await withTimeout(
      ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
          // gemini-2.5-flash spends output-token budget on internal
          // "thinking" by default; this is a straightforward extraction
          // task, so disable it to leave the full budget for the JSON.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      MODEL_TIMEOUT_MS,
      "Blueprint generation"
    );

    const text = response.text ?? "";
    const parsed = extractJsonObject(text);
    const blueprint = sanitizeBlueprint(parsed, { confidence: "model", modelUsed: model });

    // The model's training-data recall of "who competes with X" is
    // unreliable — ground it in a real web search instead when it came
    // back empty.
    if (blueprint.competitors.length === 0) {
      blueprint.competitors = await findCompetitors({
        companyName: blueprint.companyName,
        productSummary: blueprint.productSummary,
        industries: blueprint.icp.industries,
      });
    }

    return blueprint;
  } catch (err) {
    console.error(`[blueprint] model generation failed, using fallback: ${safeAiErrorMessage(err)}`);
    return fallbackBlueprint(snapshot);
  }
}
