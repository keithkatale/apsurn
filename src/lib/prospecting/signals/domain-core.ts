/**
 * Picks a company's own website from web-search results — never invents one.
 * A wrong domain gets written into the shared index and then probed for
 * emails, so a result is accepted only when its host or page title visibly
 * contains the company's name. Pure; no runtime imports (domain.test.ts).
 */

export interface DomainSearchResult {
  url: string;
  title?: string | null;
}

/** Sites that talk ABOUT companies but are never the company's own site. */
const NOT_A_COMPANY_SITE = [
  "linkedin.com", "crunchbase.com", "glassdoor.com", "indeed.com", "facebook.com", "twitter.com", "x.com", "instagram.com",
  "youtube.com", "wikipedia.org", "bloomberg.com", "reuters.com", "techcrunch.com", "pitchbook.com", "zoominfo.com", "apollo.io",
  "yelp.com", "g2.com", "capterra.com", "trustpilot.com", "medium.com", "reddit.com", "github.com", "angel.co", "wellfound.com",
  "ycombinator.com", "producthunt.com", "owler.com", "dnb.com", "rocketreach.co", "builtin.com", "remotive.com", "arbeitnow.com",
  "weworkremotely.com", "lever.co", "greenhouse.io", "ashbyhq.com", "workable.com", "bit.ly", "linktr.ee",
];

const LEGAL_SUFFIXES = /\b(inc|llc|ltd|gmbh|corp|corporation|co|company|plc|ag|sa|bv|pty|pvt|limited|group|holdings)\b\.?/g;

export function letters(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function companyKey(name: string): string {
  return letters(name.toLowerCase().replace(LEGAL_SUFFIXES, " "));
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isAggregator(host: string): boolean {
  return NOT_A_COMPANY_SITE.some((bad) => host === bad || host.endsWith(`.${bad}`));
}

function tldPartCount(parts: string[]): number {
  return parts.length >= 3 && parts[parts.length - 2].length <= 3 ? 2 : 1;
}

/** The registrable-ish label: "app.acme.co.uk" -> "acme". */
function mainLabel(host: string): string {
  const parts = host.split(".");
  return parts[Math.max(0, parts.length - 1 - tldPartCount(parts))] ?? parts[0];
}

/** "trust.armadin.com" -> "armadin.com"; "app.acme.co.uk" -> "acme.co.uk". */
export function registrableDomain(host: string): string {
  const parts = host.split(".");
  return parts.slice(Math.max(0, parts.length - 1 - tldPartCount(parts))).join(".");
}

/**
 * The host IS the company, give or take a small suffix/prefix: "acmehq" for
 * "acme", "acme" for "acme robotics". A host that merely contains the name
 * inside a long unrelated string ("theglowcocalmcarry" for "glow") is not.
 */
function hostCarriesName(label: string, key: string): boolean {
  if (label === key) return true;
  if (key.length >= 4 && label.includes(key)) return label.length - key.length <= 6;
  // The brand is the front of a longer legal name: "acme.io" for "Acme Robotics".
  if (label.length >= 4 && key.startsWith(label)) return key.length - label.length <= 12;
  if (label.length >= 5 && key.includes(label)) return key.length - label.length <= 12;
  return false;
}

/** A descriptive page title can vouch for a host that abbreviates the name ("brightwave.ai" / "Brightwave Robotics | Home"). */
function titleConfirmsHost(label: string, key: string, title: string | null | undefined): boolean {
  if (!title || label.length < 4) return false;
  const titleKey = companyKey(title);
  return titleKey.includes(key) && key.startsWith(label);
}

export function pickDomainForName(name: string, results: DomainSearchResult[]): string | null {
  const key = companyKey(name);
  if (key.length < 3) return null;

  for (const result of results) {
    const host = hostOf(result.url);
    if (!host || isAggregator(host)) continue;
    const label = letters(mainLabel(host));
    if (label.length < 3) continue;

    if (hostCarriesName(label, key) || titleConfirmsHost(label, key, result.title)) return registrableDomain(host);
  }
  return null;
}
