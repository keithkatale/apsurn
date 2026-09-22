export type CampaignIconInput = {
  name?: string | null;
  description?: string | null;
  pain?: string | null;
  outreachMethod?: string | null;
  segmentKey?: string | null;
};

const STROKE = `stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" fill="none"`;

function wrap(inner: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;
}

const MOTIFS = {
  mail: wrap(`<rect x="5" y="8" width="14" height="9" rx="1.5" ${STROKE}/><path d="M5.5 8.6 12 13.2 18.5 8.6" ${STROKE}/>`),
  handshake: wrap(`<path d="M8 14.5 6.2 12.7a1.6 1.6 0 0 1 0-2.3L8.5 8.1l2.3 2.3" ${STROKE}/><path d="M16 14.5 17.8 12.7a1.6 1.6 0 0 0 0-2.3L15.5 8.1l-2.3 2.3" ${STROKE}/><path d="M9.2 13.2h5.6" ${STROKE}/>`),
  clock: wrap(`<circle cx="12" cy="12" r="6.2" ${STROKE}/><path d="M12 9.2v3.2l2.3 1.4" ${STROKE}/>`),
  gift: wrap(`<rect x="5.5" y="11" width="13" height="7.5" rx="1.2" ${STROKE}/><path d="M5.5 11h13M12 11v7.5M9.2 8.2c0-1.3 1.1-2 2.8-2s2.8.7 2.8 2c0 1.4-2.8 2.8-2.8 2.8S9.2 9.6 9.2 8.2Z" ${STROKE}/>`),
  target: wrap(`<circle cx="12" cy="12" r="6.2" ${STROKE}/><circle cx="12" cy="12" r="3.1" ${STROKE}/><circle cx="12" cy="12" r="1.05" fill="currentColor" stroke="none"/>`),
  follow: wrap(`<path d="M6.5 8.5h7.2v7.2H6.5z" ${STROKE}/><path d="M10.8 8.5V6.8h6.7v6.7H16" ${STROKE}/>`),
  rocket: wrap(`<path d="M14.8 6.6c2.4 2.4 2.6 5.3 1.1 6.8L12 17.3 6.7 12l3.9-3.9c1.5-1.5 4.4-1.3 6.8 1.1Z" ${STROKE}/><path d="M9.4 14.6 7 17.2M11.2 16.2 9.4 18" ${STROKE}/><circle cx="13.35" cy="10.65" r="1.05" fill="currentColor" stroke="none"/>`),
  users: wrap(`<circle cx="9.2" cy="9.4" r="2.1" ${STROKE}/><path d="M5.6 16.4c.4-2.1 1.8-3.2 3.6-3.2s3.2 1.1 3.6 3.2" ${STROKE}/><circle cx="15.4" cy="9.8" r="1.7" ${STROKE}/><path d="M14.2 13.4c1.5.1 2.6 1 3 2.8" ${STROKE}/>`),
  spark: wrap(`<path d="M12 6.2 13.1 10 17 11.2 13.1 12.4 12 16.2 10.9 12.4 7 11.2 10.9 10Z" ${STROKE}/><path d="M17.4 15.2 18 16.8 19.6 17.4 18 18 17.4 19.6 16.8 18 15.2 17.4 16.8 16.8Z" fill="currentColor" stroke="none"/>`),
  search: wrap(`<circle cx="11" cy="11" r="4.4" ${STROKE}/><path d="M14.3 14.3 17.6 17.6" ${STROKE}/>`),
  building: wrap(`<path d="M7 18V8.2h10V18" ${STROKE}/><path d="M10 18v-3.2h4V18" ${STROKE}/><path d="M9.4 10.4h1.2M13.4 10.4h1.2M9.4 13h1.2M13.4 13h1.2" ${STROKE}/>`),
  chart: wrap(`<path d="M6.4 16.8h11.2M8.2 16.8V12M12 16.8V8.6M15.8 16.8v-3.4" ${STROKE}/>`),
} as const;

type Motif = keyof typeof MOTIFS;

const KEYWORDS: Array<{ motif: Motif; terms: string[] }> = [
  { motif: "handshake", terms: ["competitor", "incumbent", "switch", "displace", "replace", "vs", "versus"] },
  { motif: "clock", terms: ["trigger", "timing", "funded", "funding", "launch", "clock", "hire", "milestone"] },
  { motif: "gift", terms: ["give-first", "give first", "teardown", "value-first", "sample", "proof", "audit"] },
  { motif: "target", terms: ["vertical", "niche", "segment", "icp", "criteria", "industry"] },
  { motif: "follow", terms: ["follow-up", "follow up", "breakup", "second-touch", "second touch", "nurture"] },
  { motif: "rocket", terms: ["growth", "scale", "outbound", "pipeline", "accelerator"] },
  { motif: "users", terms: ["persona", "buyer", "founder", "operator", "team", "champion"] },
  { motif: "spark", terms: ["intent", "signal", "mention", "news", "warm"] },
  { motif: "search", terms: ["discover", "find", "source", "prospect"] },
  { motif: "building", terms: ["account", "company", "enterprise", "logo"] },
  { motif: "chart", terms: ["volume", "pipeline", "metric", "revenue"] },
  { motif: "mail", terms: ["email", "cold", "inbox", "outreach", "send", "sequence"] },
];

function blob(input: CampaignIconInput): string {
  return [input.outreachMethod, input.segmentKey, input.name, input.description, input.pain]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function pickMotif(input: CampaignIconInput): Motif {
  const text = blob(input);
  let best: Motif = "mail";
  let score = 0;
  for (const row of KEYWORDS) {
    const hits = row.terms.reduce((sum, term) => (text.includes(term) ? sum + (term.length > 8 ? 2 : 1) : sum), 0);
    if (hits > score) {
      score = hits;
      best = row.motif;
    }
  }
  return best;
}

export function generateCampaignIconSvg(input: CampaignIconInput): string {
  return MOTIFS[pickMotif(input)];
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
