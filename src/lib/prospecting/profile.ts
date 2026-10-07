/**
 * Profile details stored with every saved lead: the person's photo and
 * country, the company's description and country. Pure helpers plus one small
 * network read for the company description.
 */
import * as cheerio from "cheerio";

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "),
);

const COUNTRY_ALIASES: Record<string, string> = {
  us: "United States",
  usa: "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  "united states": "United States",
  "united states of america": "United States",
  america: "United States",
  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  gb: "United Kingdom",
  "great britain": "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",
  "united kingdom": "United Kingdom",
  uae: "United Arab Emirates",
  "the netherlands": "Netherlands",
  holland: "Netherlands",
  deutschland: "Germany",
  de: "Germany",
  fr: "France",
  ca: "Canada",
  au: "Australia",
  in: "India",
  nl: "Netherlands",
  ie: "Ireland",
  sg: "Singapore",
  se: "Sweden",
};

const NOT_A_PLACE = /^(remote|worldwide|global|anywhere|hybrid|n\/a|unknown|none)$/i;

function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/** "San Francisco, CA, USA" → "United States"; "Berlin, Germany" → "Germany"; "Remote" → null. */
export function countryFromLocation(location: string | null | undefined): string | null {
  const text = (location ?? "").replace(/\(.*?\)/g, "").trim();
  if (!text) return null;
  const parts = text.split(/[,;|]/).map((part) => part.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  if (!last || NOT_A_PLACE.test(last)) return null;

  const alias = COUNTRY_ALIASES[last.toLowerCase()];
  // "Austin, TX": a two-letter US state code with a city in front of it.
  if (/^[A-Z]{2}$/.test(last) && US_STATES.has(last) && parts.length >= 2 && !(alias && last !== "CA")) return "United States";
  if (alias) return alias;
  if (/^[A-Z]{2}$/.test(last)) return null;
  // A lone city name tells us nothing; a trailing word with several parts is the country.
  if (parts.length < 2) return null;
  return last.length > 2 ? titleCase(last) : null;
}

function linkedinHandle(url: string): string | null {
  const match = url.trim().match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]).replace(/\/+$/, "");
  } catch {
    return match[1].replace(/\/+$/, "");
  }
}

/** The best photo we can name for a person: an explicit one from the source, else their LinkedIn picture. */
export function contactPhotoUrl(input: { photoUrl?: string | null; linkedinUrl?: string | null }): string | null {
  const explicit = input.photoUrl?.trim();
  if (explicit && /^https:\/\//i.test(explicit)) return explicit.slice(0, 500);
  const handle = input.linkedinUrl ? linkedinHandle(input.linkedinUrl) : null;
  return handle ? `https://unavatar.io/linkedin/${encodeURIComponent(handle)}?fallback=false` : null;
}

function clean(text: string | undefined | null, max: number): string | null {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length < 20) return null;
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Pure: the company's own one-line description from its home page markup. */
export function extractMetaDescription(html: string): string | null {
  const $ = cheerio.load(html);
  const candidates = [
    $('meta[property="og:description"]').attr("content"),
    $('meta[name="description"]').attr("content"),
    $('meta[name="twitter:description"]').attr("content"),
  ];
  for (const candidate of candidates) {
    const value = clean(candidate, 280);
    if (value) return value;
  }
  return null;
}

/** Fetches only the top of the home page; never throws. */
export async function fetchCompanyDescription(websiteUrl: string | null | undefined): Promise<string | null> {
  if (!websiteUrl) return null;
  try {
    const { assertSafePublicUrl, USER_AGENT } = await import("@/lib/scraper/crawl");
    const url = await assertSafePublicUrl(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, signal: controller.signal, redirect: "follow" });
      if (!response.ok) return null;
      const html = (await response.text()).slice(0, 300_000);
      return extractMetaDescription(html);
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}

const profileTasks = new Map<string, Promise<unknown>[]>();

/** Lead details (like the company description) are fetched while the search keeps going, not before each lead is saved. */
export function trackProfileTask(runId: string, task: Promise<unknown>) {
  const list = profileTasks.get(runId) ?? [];
  list.push(task.catch(() => undefined));
  profileTasks.set(runId, list);
}

/** Waits for the run's outstanding profile fetches (bounded) so every saved lead has its details before the run reports done. */
export async function flushProfileTasks(runId: string, timeoutMs = 8000) {
  const list = profileTasks.get(runId);
  profileTasks.delete(runId);
  if (!list?.length) return;
  await Promise.race([Promise.allSettled(list), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}
