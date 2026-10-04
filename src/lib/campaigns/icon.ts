export type CampaignIconInput = {
  name?: string | null;
  description?: string | null;
  pain?: string | null;
  outreachMethod?: string | null;
  segmentKey?: string | null;
};

/** Google Material Symbols used for campaign and task marks. Names are ligatures, not drawn SVGs. */
export const MATERIAL_ICON_NAMES = [
  "ads_click",
  "apartment",
  "bolt",
  "bug_report",
  "business_center",
  "campaign",
  "database",
  "forum",
  "forward_to_inbox",
  "group",
  "handshake",
  "help",
  "hub",
  "lightbulb",
  "mail",
  "monitoring",
  "payments",
  "person_search",
  "redeem",
  "rocket_launch",
  "schedule",
  "send",
  "settings",
  "storefront",
  "trending_up",
  "verified",
  "waving_hand",
  "work",
] as const;

export type MaterialIconName = (typeof MATERIAL_ICON_NAMES)[number];

const ICON_SET = new Set<string>(MATERIAL_ICON_NAMES);

const KEYWORDS: Array<{ icon: MaterialIconName; terms: string[] }> = [
  { icon: "handshake", terms: ["competitor", "incumbent", "switch", "displace", "replace", "versus"] },
  { icon: "payments", terms: ["fund", "funding", "revenue", "pricing", "budget", "paid"] },
  { icon: "work", terms: ["hire", "hiring", "sdr", "recruit", "job", "headcount"] },
  { icon: "schedule", terms: ["trigger", "timing", "clock", "follow-up", "follow up", "nurture", "milestone"] },
  { icon: "redeem", terms: ["give-first", "give first", "sample", "gift", "teardown", "audit", "proof"] },
  { icon: "rocket_launch", terms: ["launch", "growth", "scale", "scaling", "accelerator", "startup"] },
  { icon: "ads_click", terms: ["intent", "signal", "click", "warm"] },
  { icon: "person_search", terms: ["prospect", "discover", "buyer", "persona", "champion", "founder"] },
  { icon: "group", terms: ["team", "operator", "users", "community"] },
  { icon: "apartment", terms: ["enterprise", "account", "company", "logo"] },
  { icon: "storefront", terms: ["vertical", "niche", "segment", "industry", "icp"] },
  { icon: "monitoring", terms: ["pipeline", "metric", "volume", "analytics"] },
  { icon: "trending_up", terms: ["outbound", "conversion", "booked"] },
  { icon: "lightbulb", terms: ["insight", "idea", "angle", "playbook"] },
  { icon: "forum", terms: ["conversation", "reply", "message", "thread"] },
  { icon: "forward_to_inbox", terms: ["sequence", "follow", "drip"] },
  { icon: "verified", terms: ["verified", "deliverability", "domain"] },
  { icon: "hub", terms: ["integration", "stack", "workflow"] },
  { icon: "business_center", terms: ["sales", "deal", "quota"] },
  { icon: "mail", terms: ["email", "cold", "inbox", "outreach", "send"] },
];

function blob(input: CampaignIconInput): string {
  return [input.outreachMethod, input.segmentKey, input.name, input.description, input.pain]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function materialSymbolsStylesheet() {
  const names = [...MATERIAL_ICON_NAMES].sort().join(",");
  return `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&icon_names=${names}`;
}

function pickMaterialIcon(input: CampaignIconInput): MaterialIconName {
  const text = blob(input);
  let best: MaterialIconName = "campaign";
  let score = 0;
  for (const row of KEYWORDS) {
    const hits = row.terms.reduce((sum, term) => (text.includes(term) ? sum + (term.length > 8 ? 2 : 1) : sum), 0);
    if (hits > score) {
      score = hits;
      best = row.icon;
    }
  }
  return best;
}

export function readMaterialIcon(stored?: string | null): MaterialIconName | null {
  if (!stored) return null;
  const trimmed = stored.trim();
  const name = trimmed.startsWith("mi:") ? trimmed.slice(3) : trimmed;
  if (name.includes("<") || name.includes(" ")) return null;
  return ICON_SET.has(name) ? (name as MaterialIconName) : null;
}

/** Stable Google icon for a campaign. Stored values win; older SVG marks are re-picked from the copy. */
export function campaignMaterialIcon(input: CampaignIconInput, stored?: string | null): MaterialIconName {
  return readMaterialIcon(stored) ?? pickMaterialIcon(input);
}

export function generateCampaignIconSvg(input: CampaignIconInput): string {
  return `mi:${pickMaterialIcon(input)}`;
}

const ALLOWED_TAGS = new Set(["svg", "rect", "path", "circle", "g"]);

/** Strip legacy blue fills/backgrounds and inherit text color. */
export function normalizeCampaignIconSvg(raw: string): string {
  return raw
    .replace(/<rect\b[^>]*\b(?:width|height)=["']24["'][^>]*\/?>/gi, "")
    .replace(/fill=["']#E8F1FC["']/gi, 'fill="none"')
    .replace(/fill=["']#4379EE["']/gi, 'fill="currentColor"')
    .replace(/stroke=["']#4379EE["']/gi, 'stroke="currentColor"')
    .replace(/fill=["']#?[0-9a-fA-F]{3,8}["']/gi, (match) =>
      /fill=["']none["']/i.test(match) ? match : 'fill="currentColor"',
    )
    .replace(/stroke=["']#?[0-9a-fA-F]{3,8}["']/gi, 'stroke="currentColor"');
}

export function sanitizeCampaignIconSvg(raw: string | null | undefined): string | null {
  if (!raw?.includes("<svg")) return null;
  const compact = raw.replace(/\s+/g, " ").trim();
  if (compact.length > 2500) return null;
  if (/<script|on\w+=|javascript:|foreignObject|<use|<image|<style/i.test(compact)) return null;
  const tags = [...compact.matchAll(/<\/?([a-z0-9]+)/gi)].map((match) => match[1].toLowerCase());
  if (tags.some((tag) => !ALLOWED_TAGS.has(tag))) return null;
  return normalizeCampaignIconSvg(compact);
}

export function campaignIconSvg(input: CampaignIconInput, stored?: string | null): string {
  return sanitizeCampaignIconSvg(stored) ?? generateCampaignIconSvg(input);
}
