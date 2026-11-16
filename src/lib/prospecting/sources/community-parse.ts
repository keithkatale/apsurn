/** Pure parsers for the community sources. No imports, so they run under node:test (community.test.ts). */

function normalizeHost(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const host = new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

// Hosts that are never a company's own domain: stores, code hosts, social, hosting subdomains, aggregators.
const NOT_A_COMPANY_HOST =
  /(^|\.)(github\.com|github\.io|gitlab\.com|bitbucket\.org|youtube\.com|youtu\.be|twitter\.com|x\.com|medium\.com|substack\.com|notion\.site|notion\.so|vercel\.app|netlify\.app|herokuapp\.com|pages\.dev|web\.app|firebaseapp\.com|onrender\.com|fly\.dev|railway\.app|streamlit\.app|replit\.app|replit\.dev|framer\.website|framer\.app|carrd\.co|apps\.apple\.com|itunes\.apple\.com|play\.google\.com|chromewebstore\.google\.com|chrome\.google\.com|addons\.mozilla\.org|figma\.com|linkedin\.com|facebook\.com|instagram\.com|reddit\.com|news\.ycombinator\.com|ycombinator\.com|producthunt\.com|betalist\.com|arxiv\.org|wikipedia\.org|google\.com|bit\.ly|t\.co|linktr\.ee|typeform\.com|huggingface\.co|kaggle\.com|npmjs\.com|pypi\.org|grnh\.se|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|workdayjobs\.com|myworkdayjobs\.com|smartrecruiters\.com|jobvite\.com|bamboohr\.com|breezy\.hr|recruitee\.com|teamtailor\.com|wellfound\.com|angel\.co|join\.com|rippling\.com|dover\.com|gem\.com|remoteok\.com|weworkremotely\.com|openstreetmap\.org)$/i;

/** The company's own domain from a URL, or null when it points at a store, a repo, a social profile or a hosting subdomain. */
export function companyDomainFromUrl(url: string | null | undefined): string | null {
  const domain = normalizeHost(url ?? null);
  if (!domain || NOT_A_COMPANY_HOST.test(domain)) return null;
  return domain;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ");
}

/** Strips tags from an HTML fragment into readable lines (links keep their href so URLs survive). */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => (label.includes("…") || label.trim() === "" ? href : `${label} (${href})`))
      .replace(/<(p|br|li|div)\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}


const SEASON_START_MONTH: Record<string, number> = { winter: 0, spring: 3, summer: 5, fall: 8 };

/** "Fall 2026" -> the month that batch begins, as an ISO date. Unknown formats give null. */
export function batchStartDate(batch: string): string | null {
  const match = /^(winter|spring|summer|fall)\s+(\d{4})$/i.exec(batch.trim());
  if (!match) return null;
  return new Date(Date.UTC(Number(match[2]), SEASON_START_MONTH[match[1].toLowerCase()], 1)).toISOString();
}

export function batchSlug(batch: string): string {
  return batch.trim().toLowerCase().replace(/\s+/g, "-");
}

/** The batches to look at: the current one and the previous few, newest first. */
export function recentBatches(now = new Date(), count = 3): string[] {
  const seasons = ["Winter", "Spring", "Summer", "Fall"];
  let year = now.getUTCFullYear();
  let index = 0;
  seasons.forEach((season, i) => {
    if (SEASON_START_MONTH[season.toLowerCase()] <= now.getUTCMonth()) index = i;
  });
  const out: string[] = [];
  while (out.length < count) {
    out.push(`${seasons[index]} ${year}`);
    index -= 1;
    if (index < 0) {
      index = 3;
      year -= 1;
    }
  }
  return out;
}


/** "Show HN: Foo – does X" -> { name: "Foo", tagline: "does X" }. */
export function parseShowHnTitle(title: string): { name: string; tagline: string } | null {
  const body = title.replace(/^(show|launch) hn:\s*/i, "").trim();
  if (!body || body === title.trim()) return null;
  const match = /^(.{2,60}?)\s*(?:[–—-]|:|\|)\s+(.+)$/.exec(body);
  if (match) return { name: match[1].trim(), tagline: match[2].trim() };
  return { name: body.split(/\s+/).slice(0, 3).join(" "), tagline: body };
}


export interface HiringPost {
  company: string;
  roles: string;
  location: string | null;
  url: string | null;
  postedAt: string | null;
  sourceUrl: string;
  text: string;
}

/** "Acme (YC W21) | Founding AE | Remote | https://acme.com" -> company, roles, location, url. */
export function parseHiringComment(html: string): Omit<HiringPost, "postedAt" | "sourceUrl"> | null {
  const text = htmlToText(html);
  const first = text.split("\n")[0] ?? "";
  const parts = first.split("|").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const company = parts[0].replace(/\s*\((?:YC|S|W)[^)]*\)\s*/gi, " ").replace(/\s*\([a-z0-9-]+(?:\.[a-z0-9-]+)+\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  if (!company || company.length > 60 || /^(re|edit|thanks|http)/i.test(company)) return null;
  const urlMatch = /https?:\/\/[^\s)<>"']+/.exec(text);
  // "Acme (acme.com)": the company named its own domain.
  const named = /\(([a-z0-9-]+(?:\.[a-z0-9-]+)+)\)/i.exec(parts[0])?.[1] ?? null;
  const location = parts.find((part) => /remote|onsite|hybrid|\b[A-Z]{2}\b|,|usa|europe|uk\b|germany|london|berlin|nyc|san francisco/i.test(part) && part !== parts[0]) ?? null;
  const roles = parts.slice(1).filter((part) => part !== location && !/^https?:/i.test(part)).join(" | ");
  return { company, roles: roles || parts[1], location, url: named ? `https://${named}` : urlMatch ? urlMatch[0].replace(/[.,;]+$/, "") : null, text };
}


/** Entries of an Atom feed: title, link, published date and the plain-text summary. */
export function parseAtomEntries(xml: string): Array<{ title: string; link: string; published: string | null; summary: string; outbound: string | null }> {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  return entries.flatMap((entry) => {
    const title = /<title[^>]*>([\s\S]*?)<\/title>/.exec(entry)?.[1];
    const link = /<link[^>]*rel="alternate"[^>]*href="([^"]+)"/.exec(entry)?.[1];
    if (!title || !link) return [];
    const published = /<published>([^<]+)<\/published>/.exec(entry)?.[1] ?? null;
    const content = decodeEntities(/<content[^>]*>([\s\S]*?)<\/content>/.exec(entry)?.[1] ?? "");
    const outbound = /<a href="(https?:\/\/www\.producthunt\.com\/r\/[^"]+)"[^>]*>\s*Link\s*<\/a>/i.exec(content)?.[1] ?? null;
    return [{ title: decodeEntities(title.trim()), link, published, summary: htmlToText(content).split("\n")[0]?.trim() ?? "", outbound: outbound ? decodeEntities(outbound) : null }];
  });
}


/** Startup slugs, names and taglines from BetaList's front page: one `startup-row` block per startup. */
export function parseBetaListHome(html: string): Array<{ slug: string; name: string; tagline: string }> {
  const out: Array<{ slug: string; name: string; tagline: string }> = [];
  const seen = new Set<string>();
  for (const block of html.split(/startup-row"/).slice(1)) {
    const slug = /href="\/startups\/([a-z0-9-]+)"/.exec(block)?.[1];
    if (!slug || seen.has(slug)) continue;
    const texts = [...block.slice(0, 1800).matchAll(/>([^<>]{3,220})</g)]
      .map((m) => decodeEntities(m[1].trim()))
      .filter((text) => text && !/^(follow|visit)$/i.test(text) && !text.includes("{") && !/^\d+$/.test(text));
    if (texts.length < 2) continue;
    seen.add(slug);
    out.push({ slug, name: texts[0], tagline: texts[1] });
  }
  return out;
}


export interface YcFounder {
  name: string;
  title: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
}

/** A LinkedIn profile URL only when a YC company page or a company team page published it. */
export function founderLinkedIn(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!/^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\/in\/[a-z0-9_%-]+\/?$/i.test(trimmed)) return null;
  return trimmed;
}

export interface JobBoardCompany {
  name: string;
  domain: string | null;
  description: string;
  location: string | null;
  sourceUrl: string;
  postedAt: string | null;
}

function postedIso(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof value === "string" && value.trim() && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

/** Remote OK's public JSON. The first element is a legal notice, not a job. */
export function parseRemoteOk(rows: unknown[]): JobBoardCompany[] {
  const out: JobBoardCompany[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const job = row as Record<string, unknown>;
    if (typeof job.legal === "string" || typeof job.company !== "string") continue;
    const name = job.company.trim();
    const role = typeof job.position === "string" ? job.position.trim() : "";
    if (!name || !role) continue;
    const apply = typeof job.apply_url === "string" ? job.apply_url : typeof job.url === "string" ? job.url : "";
    const domain = companyDomainFromUrl(apply);
    const sourceUrl = typeof job.url === "string" && job.url.startsWith("http") ? job.url : apply;
    const key = (domain ?? name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      domain,
      description: role,
      location: typeof job.location === "string" && job.location.trim() ? job.location.trim() : null,
      sourceUrl: sourceUrl || `https://remoteok.com`,
      postedAt: postedIso(job.epoch ?? job.date),
    });
  }
  return out;
}

/** We Work Remotely RSS. Titles are "Company: Role". A company site is taken from the description when present. */
export function parseWwrRss(xml: string): JobBoardCompany[] {
  const out: JobBoardCompany[] = [];
  const seen = new Set<string>();
  for (const block of xml.split(/<item\b/i).slice(1)) {
    const title = decodeEntities(/<title>([\s\S]*?)<\/title>/i.exec(block)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? "");
    const split = title.indexOf(":");
    if (split < 1) continue;
    const name = title.slice(0, split).trim();
    const role = title.slice(split + 1).trim();
    if (!name || !role) continue;
    const link = /<link>([\s\S]*?)<\/link>/i.exec(block)?.[1]?.trim() ?? "";
    const description = /<description>([\s\S]*?)<\/description>/i.exec(block)?.[1] ?? "";
    const hrefs = [...description.matchAll(/https?:\/\/[^"'<\s]+/gi)].map((m) => m[0]);
    const domain = hrefs.map((href) => companyDomainFromUrl(href)).find(Boolean) ?? null;
    const region = /<region>([\s\S]*?)<\/region>/i.exec(block)?.[1]?.trim() || null;
    const key = (domain ?? name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const pubDate = /<pubDate>([\s\S]*?)<\/pubDate>/i.exec(block)?.[1]?.trim() ?? null;
    out.push({ name, domain, description: role, location: region, sourceUrl: link || "https://weworkremotely.com", postedAt: postedIso(pubDate) });
  }
  return out;
}

export interface RedditLaunchPost {
  name: string;
  domain: string;
  title: string;
  sourceUrl: string;
  postedAt: string | null;
}

const LAUNCH_TITLE = /\b(launch|launched|show r\/|i built|we built|just shipped|introducing)\b/i;

/** Reddit listing JSON. The company is the outbound link, never the poster. */
export function parseRedditLaunches(payload: unknown): RedditLaunchPost[] {
  const children = (payload as { data?: { children?: unknown[] } })?.data?.children;
  if (!Array.isArray(children)) return [];
  const out: RedditLaunchPost[] = [];
  const seen = new Set<string>();
  for (const child of children) {
    const post = (child as { data?: Record<string, unknown> })?.data;
    if (!post) continue;
    const title = typeof post.title === "string" ? post.title.trim() : "";
    const url = typeof post.url === "string" ? post.url : "";
    const permalink = typeof post.permalink === "string" ? post.permalink : "";
    const domain = companyDomainFromUrl(url);
    if (!title || !domain || !LAUNCH_TITLE.test(title)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    const name = title.split(/[:|\-–—]/)[0]?.trim().slice(0, 80) || domain;
    out.push({
      name,
      domain,
      title,
      sourceUrl: permalink.startsWith("/") ? `https://www.reddit.com${permalink}` : permalink || url,
      postedAt: postedIso(post.created_utc),
    });
  }
  return out;
}

export interface OsmPlace {
  name: string;
  domain: string | null;
  phone: string | null;
  location: string | null;
  website: string | null;
}

/** Overpass elements: name, website, phone and address tags only. */
export function parseOverpassElements(elements: unknown[]): OsmPlace[] {
  const out: OsmPlace[] = [];
  const seen = new Set<string>();
  for (const element of elements) {
    const tags = (element as { tags?: Record<string, string> })?.tags;
    if (!tags?.name) continue;
    const website = tags.website || tags["contact:website"] || null;
    const domain = companyDomainFromUrl(website);
    const phone = tags.phone || tags["contact:phone"] || null;
    const location = [tags["addr:housenumber"], tags["addr:street"], tags["addr:city"]].filter(Boolean).join(" ") || tags["addr:city"] || null;
    const key = (domain ?? tags.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: tags.name.trim(), domain, phone, location, website });
  }
  return out;
}

/** Founders listed on a Y Combinator company page (the page embeds its data as JSON in `data-page`). CEO first. */
export function parseYcFounders(html: string): YcFounder[] {
  const raw = /data-page="([^"]+)"/.exec(html)?.[1];
  if (!raw) return [];
  let page: unknown;
  try {
    page = JSON.parse(decodeEntities(raw));
  } catch {
    return [];
  }
  const founders = (page as { props?: { company?: { founders?: unknown } } })?.props?.company?.founders;
  if (!Array.isArray(founders)) return [];
  const out: YcFounder[] = [];
  for (const row of founders) {
    const f = row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    const name = typeof f?.full_name === "string" ? f.full_name.trim() : "";
    if (!name) continue;
    out.push({
      name,
      title: typeof f?.title === "string" && f.title.trim() ? f.title.trim() : null,
      linkedinUrl: founderLinkedIn(typeof f?.linkedin_url === "string" ? f.linkedin_url : null),
      twitterUrl: typeof f?.twitter_url === "string" && f.twitter_url ? f.twitter_url : null,
    });
  }
  return out.sort((a, b) => Number(/ceo/i.test(b.title ?? "")) - Number(/ceo/i.test(a.title ?? "")));
}

/** Makers listed on a Product Hunt product page (names only: PH shows no contact details). */
export function parsePhMakers(html: string): string[] {
  const start = html.indexOf('"makers":[');
  if (start < 0) return [];
  let depth = 0;
  let end = -1;
  for (let i = start + '"makers":'.length; i < html.length; i++) {
    const char = html[i];
    if (char === "[") depth++;
    else if (char === "]" && --depth === 0) {
      end = i + 1;
      break;
    }
  }
  if (end < 0) return [];
  try {
    const rows = JSON.parse(html.slice(start + '"makers":'.length, end)) as Array<{ name?: unknown }>;
    return rows
      .map((row) => (typeof row.name === "string" ? row.name.trim() : ""))
      .filter((name) => /^[\p{L}][\p{L}\p{M}\s.'’-]{1,60}$/u.test(name));
  } catch {
    return [];
  }
}
