import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { promises as dns } from "node:dns";
import * as cheerio from "cheerio";

export interface ScrapedPage { url: string; title: string; text: string; html: string; contentHash: string; sourceType: "website" | "public_document"; }
export interface SiteSnapshot { rootUrl: string; pages: ScrapedPage[]; fetchedAt: string; }

const HINTS = ["about", "leadership", "team", "people", "company", "contact", "news", "press", "author", "product", "solutions"];
const USER_AGENT = "ApsurnBot/1.0 (+https://apsurn.com/bot; contact: privacy@apsurn.com)";
const MAX_BYTES = 1_500_000;

function privateIp(ip: string) {
  if (isIP(ip) === 4) {
    const p = ip.split(".").map(Number);
    return p[0] === 10 || p[0] === 127 || p[0] === 0 || (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
}

export async function assertSafePublicUrl(input: string): Promise<URL> {
  const raw = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error("Only public HTTP(S) URLs are allowed");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("Private network URLs are not allowed");
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateIp(address))) throw new Error("Private network URLs are not allowed");
  return url;
}

async function robotsAllows(root: URL, path: string) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4_000);
    const res = await fetch(new URL("/robots.txt", root), { signal: controller.signal, headers: { "User-Agent": USER_AGENT } }).finally(() => clearTimeout(timer));
    if (!res.ok) return true;
    let applies = false;
    for (const raw of (await res.text()).split(/\r?\n/)) {
      const [field, ...rest] = raw.split("#")[0].trim().split(":");
      const value = rest.join(":").trim();
      if (field?.toLowerCase() === "user-agent") applies = value === "*" || value.toLowerCase().includes("apsurnbot");
      if (applies && field?.toLowerCase() === "disallow" && value && path.startsWith(value)) return false;
    }
  } catch { /* Missing robots.txt is not a prohibition. */ }
  return true;
}

async function fetchHtml(url: URL, root: URL, redirects = 0): Promise<string | null> {
  if (redirects > 3 || !(await robotsAllows(root, url.pathname))) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      const next = await assertSafePublicUrl(new URL(location, url).toString());
      if (next.hostname !== root.hostname) return null;
      return fetchHtml(next, root, redirects + 1);
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
    const html = await res.text();
    return html.length <= MAX_BYTES ? html : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

function extractPage(html: string, url: string): ScrapedPage {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, svg, iframe").remove();
  return {
    url,
    title: $("title").first().text().trim().slice(0, 200),
    text: $("body").text().replace(/\s+/g, " ").trim().slice(0, 8_000),
    html,
    contentHash: createHash("sha256").update(html).digest("hex"),
    sourceType: "website",
  };
}

function links(html: string, root: URL) {
  const $ = cheerio.load(html);
  const found = new Map<string, number>();
  $("a[href]").each((_, element) => {
    try {
      const url = new URL($(element).attr("href") ?? "", root);
      if (url.hostname !== root.hostname || !['http:', 'https:'].includes(url.protocol)) return;
      url.hash = "";
      const rank = HINTS.findIndex((hint) => url.pathname.toLowerCase().includes(hint));
      if (rank >= 0 && !found.has(url.toString())) found.set(url.toString(), rank);
    } catch { /* Ignore malformed links. */ }
  });
  return [...found].sort((a, b) => a[1] - b[1]).slice(0, 7).map(([url]) => new URL(url));
}

export async function crawlSite(inputUrl: string): Promise<SiteSnapshot> {
  const root = await assertSafePublicUrl(inputUrl);
  const home = await fetchHtml(root, root);
  if (!home) throw new Error(`Could not safely fetch ${root.toString()}`);
  const pages = [extractPage(home, root.toString())];
  for (const url of links(home, root)) {
    const html = await fetchHtml(url, root);
    if (html) {
      const page = extractPage(html, url.toString());
      if (page.text.length > 40) pages.push(page);
    }
  }
  return { rootUrl: root.toString(), pages, fetchedAt: new Date().toISOString() };
}
