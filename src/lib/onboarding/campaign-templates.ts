import { generateCampaignIconSvg } from "@/lib/campaigns/icon";

export interface CampaignDefinition {
  name: string;
  description: string;
  pain: string;
  targeting: string[];
  sampleAccounts: string[];
  estimatedVolume: number;
  segmentKey: string;
  outreachMethod: string;
  iconSvg?: string;
}

const METHODS = [
  {
    key: "cold-email",
    outreachMethod: "Cold email",
    name: "ICP match",
    description: "Open qualified conversations with the core buyer using a specific ICP hypothesis",
    pain: "Unsure who to target or what to say first",
  },
  {
    key: "competitor-displacement",
    outreachMethod: "Competitor displacement",
    name: "Switch from the incumbent",
    description: "Position against named competitors and give a reason to try a different motion",
    pain: "Looks interchangeable with agencies already in the category",
  },
  {
    key: "trigger",
    outreachMethod: "Trigger / timing",
    name: "Funded and launching",
    description: "Reach teams under a live clock — recent funding, a new offer, or a first hire",
    pain: "Need traction before the next milestone",
  },
  {
    key: "value-first",
    outreachMethod: "Give-first",
    name: "Value-first teardown",
    description: "Lead with a short teardown or named-account sample instead of a pitch",
    pain: "Skeptical of vendors with no proof yet",
  },
  {
    key: "vertical",
    outreachMethod: "Vertical",
    name: "Niche operator",
    description: "Talk to a tighter segment than the homepage claims, with criteria they already recognize",
    pain: "Generic messaging that does not name their buyer",
  },
  {
    key: "follow-up",
    outreachMethod: "Follow-up",
    name: "Breakup sequence",
    description: "A second-touch campaign for the same ICP when the opener is ignored",
    pain: "First emails get buried and never get a clean second ask",
  },
] as const;

export function fallbackCampaigns(input: {
  personas: Array<{ title?: string; painPoints?: string[] }>;
  icp: { industries?: string[]; companySizeRange?: string; geographies?: string[] };
  competitors: string[];
  productSummary?: string | null;
}): CampaignDefinition[] {
  const persona = input.personas[0]?.title || "decision makers";
  const industries = input.icp.industries?.slice(0, 3) ?? [];
  const size = input.icp.companySizeRange || "your ICP size";
  const geos = input.icp.geographies?.slice(0, 2).join(", ") || "your markets";
  const competitor = input.competitors[0] || "the usual agencies";
  const samples = input.competitors.slice(0, 6);

  return METHODS.map((method, index) => {
    const personaTitle = input.personas[index]?.title || persona;
    const campaign: CampaignDefinition = {
      name: input.personas[index]?.title || method.name,
      outreachMethod: method.outreachMethod,
      description:
        method.key === "competitor-displacement"
          ? `Show why this offer beats ${competitor} for ${persona}`
          : method.description,
      pain: input.personas[index]?.painPoints?.[0] || method.pain,
      targeting: [
        `Buyer: ${personaTitle}`,
        industries[0] ? `Industry: ${industries.join(", ")}` : "Matches the approved ICP",
        `${size} · ${geos}`,
      ].filter(Boolean),
      sampleAccounts: samples,
      estimatedVolume: 220 - index * 20,
      segmentKey: method.key,
    };
    campaign.iconSvg = generateCampaignIconSvg(campaign);
    return campaign;
  });
}
