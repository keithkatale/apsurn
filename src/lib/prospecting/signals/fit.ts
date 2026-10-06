import { getAiClient } from "@/lib/ai/openai";
import type { ProspectCriteria } from "../types";
import { buildFitPrompt, parseFitVerdicts, type FitItem } from "./fit-core";
import type { SignalCandidate } from "./types";

const BATCH = 25;

/**
 * Keeps job-board candidates that plausibly belong to the ICP. This classifies
 * facts we already hold (a name, a domain, a role) — it discovers nothing.
 * If the model is unavailable or answers unusably the candidates pass through
 * unfiltered, and that is logged: dropping every lead because a classifier
 * hiccuped would be worse than letting a few off-ICP ones reach review.
 */
export async function filterByIcpFit(candidates: SignalCandidate[], criteria: ProspectCriteria, productSummary?: string | null): Promise<SignalCandidate[]> {
  if (candidates.length === 0) return candidates;
  const kept: SignalCandidate[] = [];
  let ai: Awaited<ReturnType<typeof getAiClient>>;
  try {
    ai = await getAiClient();
  } catch (error) {
    console.warn("[signals] ICP fit pass skipped (no AI client):", error instanceof Error ? error.message : error);
    return candidates;
  }

  for (let offset = 0; offset < candidates.length; offset += BATCH) {
    const batch = candidates.slice(offset, offset + BATCH);
    const items: FitItem[] = batch.map((candidate, i) => ({ idx: i + 1, company: candidate.companyName, domain: candidate.domain ?? "", role: candidate.excerpt }));
    try {
      const response = await ai.ai.responses.create({
        model: ai.model,
        thinking_budget: 0,
        max_output_tokens: 1500,
        text: { format: { type: "json_object" } },
        input: buildFitPrompt(items, { industries: criteria.industries, geographies: criteria.geographies, companySizeRange: criteria.companySizeRange, productSummary }),
      });
      const fits = parseFitVerdicts(String(response.output_text ?? ""), items.map((item) => item.idx));
      if (!fits) {
        console.warn("[signals] ICP fit reply unusable; keeping this batch unfiltered");
        kept.push(...batch);
        continue;
      }
      batch.forEach((candidate, i) => {
        if (fits.has(i + 1)) kept.push(candidate);
      });
    } catch (error) {
      console.warn("[signals] ICP fit call failed; keeping this batch unfiltered:", error instanceof Error ? error.message : error);
      kept.push(...batch);
    }
  }
  return kept;
}
