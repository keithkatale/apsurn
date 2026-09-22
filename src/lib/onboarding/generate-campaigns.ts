import { getAiClient } from "@/lib/ai/openai";
import { safeAiErrorMessage } from "@/lib/ai/errors";
import { generateCampaignIconSvg } from "@/lib/campaigns/icon";
import { fallbackCampaigns, type CampaignDefinition } from "./campaign-templates";

export type { CampaignDefinition } from "./campaign-templates";
export { fallbackCampaigns } from "./campaign-templates";

export type CampaignGenInput = {
  companyName: string | null;
  productSummary: string | null;
  valueProp: string | null;
  positioning: string | null;
  icp: { industries?: string[]; companySizeRange?: string; geographies?: string[] };
  personas: Array<{ title?: string; painPoints?: string[]; goals?: string[] }>;
  competitors: string[];
};

function campaignPrompt(input: CampaignGenInput) {
  return `Design 5 distinct outbound campaigns for this B2B company. Each campaign MUST use a different outreach method.

Company: ${input.companyName ?? "unknown"}
Product: ${input.productSummary ?? "unknown"}
Value prop: ${input.valueProp ?? "unknown"}
Positioning: ${input.positioning ?? "unknown"}
ICP: ${(input.icp.industries ?? []).join(", ") || "unknown"} · ${input.icp.companySizeRange ?? "unknown"} · ${(input.icp.geographies ?? []).join(", ") || "unknown"}
Personas: ${input.personas.map((p) => `${p.title}: ${(p.painPoints ?? []).join("; ")}`).join(" | ") || "unknown"}
Competitors: ${input.competitors.join(", ") || "none"}

Required methods (use each once): Cold email, Competitor displacement, Trigger / timing, Give-first, Vertical.

Return ONLY a JSON array of 5 objects:
[{"name":"short segment","outreachMethod":"Cold email","description":"one sentence","pain":"one line","targeting":["3 bullets"],"sampleAccounts":["4 company names"],"estimatedVolume":180,"segmentKey":"kebab-id"}]`;
}

export function parseCampaign(row: unknown): CampaignDefinition | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) return null;
  const parsed: CampaignDefinition = {
    name: name.slice(0, 80),
    description: typeof r.description === "string" ? r.description.trim().slice(0, 280) : "",
    pain: typeof r.pain === "string" ? r.pain.trim().slice(0, 160) : "",
    targeting: Array.isArray(r.targeting)
      ? r.targeting.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 5)
      : [],
    sampleAccounts: Array.isArray(r.sampleAccounts)
      ? r.sampleAccounts.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 8)
      : [],
    estimatedVolume:
      typeof r.estimatedVolume === "number" && Number.isFinite(r.estimatedVolume)
        ? Math.max(20, Math.min(5000, Math.round(r.estimatedVolume)))
        : 200,
    segmentKey:
      typeof r.segmentKey === "string" && r.segmentKey.trim()
        ? r.segmentKey.trim().slice(0, 60)
        : name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60),
    outreachMethod:
      typeof r.outreachMethod === "string" && r.outreachMethod.trim()
        ? r.outreachMethod.trim().slice(0, 40)
        : "Cold email",
  };
  parsed.iconSvg = generateCampaignIconSvg(parsed);
  return parsed;
}

export function parseCompletedCampaigns(text: string): CampaignDefinition[] {
  const start = text.indexOf("[");
  if (start < 0) return [];
  const slice = text.slice(start + 1);
  const found: CampaignDefinition[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0 && objStart >= 0) {
        try {
          const parsed = parseCampaign(JSON.parse(slice.slice(objStart, i + 1)));
          if (parsed) found.push(parsed);
        } catch {
          /* incomplete or invalid object */
        }
        objStart = -1;
      }
    }
  }
  return found;
}

export async function* streamCampaignDefinitions(input: CampaignGenInput): AsyncGenerator<CampaignDefinition> {
  const fallback = fallbackCampaigns({
    personas: input.personas,
    icp: input.icp,
    competitors: input.competitors,
    productSummary: input.productSummary,
  });

  try {
    const { ai, model } = await getAiClient();
    const stream = await ai.responses.create({
      model,
      input: campaignPrompt(input),
      max_output_tokens: 1600,
      stream: true,
    });
    let acc = "";
    let emitted = 0;
    const seen = new Set<string>();
    for await (const event of stream) {
      if (event.type !== "response.output_text.delta") continue;
      const delta = typeof event.delta === "string" ? event.delta : "";
      if (!delta) continue;
      acc += delta;
      const all = parseCompletedCampaigns(acc);
      while (emitted < all.length) {
        const campaign = all[emitted];
        emitted += 1;
        if (seen.has(campaign.segmentKey)) continue;
        seen.add(campaign.segmentKey);
        yield campaign;
      }
    }
    if (emitted === 0) {
      for (const campaign of fallback) yield campaign;
      return;
    }
    if (emitted < 4) {
      for (const campaign of fallback) {
        if (seen.has(campaign.segmentKey)) continue;
        yield campaign;
        emitted += 1;
        if (emitted >= 6) break;
      }
    }
  } catch (error) {
    console.error("[onboarding] campaign stream failed:", safeAiErrorMessage(error));
    for (const campaign of fallback) yield campaign;
  }
}

export async function generateCampaignDefinitions(input: CampaignGenInput): Promise<CampaignDefinition[]> {
  const campaigns: CampaignDefinition[] = [];
  for await (const campaign of streamCampaignDefinitions(input)) {
    campaigns.push(campaign);
  }
  return campaigns.slice(0, 6);
}
