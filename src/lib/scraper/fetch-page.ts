/**
 * Hybrid page fetcher for the directory scraping agent.
 *
 * Tries a native `fetch` first (cheap, fast). Escalates to a headless
 * Playwright Chromium render when `render` is requested or when the fetched
 * HTML looks like a JS shell (empty body, framework bootstrap, noscript-only).
 *
 * Reuses the SSRF guard (`assertSafePublicUrl`) and robots.txt honoring from
 * `crawl.ts`, and enforces per-domain serialization + a politeness delay so a
 * single host is never hit concurrently or too fast.
 *
 * Playwright is imported dynamically so the module still loads (and native
 * fetch still works) in environments where Chromium isn't installed, e.g.
 * Vercel. The headless browser only works on a host that ships Chromium
 * (Cloud Run image from the Dockerfile in this repo).
 */

import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import {
  MAX_BYTES,
  USER_AGENT,
  assertSafePublicUrl,
  robotsAllows,
} from "./crawl";

const FETCH_TIMEOUT_MS = 12_000;
const RENDER_TIMEOUT_MS = 25_000;

function politenessDelayMs(): number {
  const v = Number(process.env.SCRAPER_DOMAIN_DELAY_MS ?? "");
  return Number.isFinite(v) && v >= 0 ? v : 1_500;
}

function renderingEnabled(): boolean {
  // Rendering is opt-out; default on. Set SCRAPER_ENABLE_RENDER=0 to force
  // fetch-only (e.g. on a host without Chromium).
  const v = process.env.SCRAPER_ENABLE_RENDER?.trim().toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  title: string;
  text: string;
  html: string;
  contentHash: string;
  rendered: boolean;
  links: string[];
}

// ── Per-domain serialization + politeness ────────────────────────────────
const domainChains = new Map<string, Promise<unknown>>();
const domainLastHit = new Map<string, number>();

async function withDomainLock<T>(host: string, task: () => Promise<T>): Promise<T> {
  const prior = domainChains.get(host) ?? Promise.resolve();
  const run = prior
    .catch(() => {})
    .then(async () => {
      const last = domainLastHit.get(host) ?? 0;
      const wait = politenessDelayMs() - (Date.now() - last);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await task();
      } finally {
        domainLastHit.set(host, Date.now());
      }
    });
  domainChains.set(
    host,
    run.catch(() => {})
  );
  return run;
}

// ── Shared headless browser singleton ────────────────────────────────────
type PwBrowser = {
  newContext: (opts: Record<string, unknown>) => Promise<PwContext>;
  close: () => Promise<void>;
};
type PwContext = {
  newPage: () => Promise<PwPage>;
  close: () => Promise<void>;
};
type PwPage = {
  goto: (url: string, opts: Record<string, unknown>) => Promise<{ status: () => number } | null>;
  content: () => Promise<string>;
  url: () => string;
  close: () => Promise<void>;
};

let browserPromise: Promise<PwBrowser | null> | null = null;

async function getBrowser(): Promise<PwBrowser | null> {
  if (!renderingEnabled()) return null;
  if (!browserPromise) {
    browserPromise = (async () => {
      try {
        // Dynamic import via a computed specifier so the build doesn't fail
        // when Playwright isn't installed (e.g. Vercel). Chromium is present in
        // the Cloud Run image. Absent dependency must not break native fetch.
        const specifier = "playwright";
        const mod = (await import(/* webpackIgnore: true */ specifier)) as {
          chromium: {
            launch: (opts: Record<string, unknown>) => Promise<PwBrowser>;
          };
        };
        return await mod.chromium.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        });
      } catch (error) {
        console.error(
          "[scraper] Playwright unavailable; falling back to fetch only:",
          error instanceof Error ? error.message : error
        );
        return null;
      }
    })();
  }
  return browserPromise;
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => null);
    browserPromise = null;
    if (browser) await browser.close().catch(() => {});
  }
}

// ── HTML → structured page ───────────────────────────────────────────────
function parseHtml(html: string, url: string): {
  title: string;
  text: string;
  links: string[];
} {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe").remove();
  const title = $("title").first().text().trim().slice(0, 200);
  const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 12_000);
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    try {
      const link = new URL($(el).attr("href") ?? "", url);
      if (!["http:", "https:"].includes(link.protocol)) return;
      link.hash = "";
      links.add(link.toString());
    } catch {
      /* ignore malformed */
    }
  });
  return { title, text, links: [...links].slice(0, 200) };
}

/**
 * A page whose meaningful content is only present after JS runs: little/no
 * body text but a framework bootstrap payload or a noscript nudge.
 */
function looksJsShell(html: string): boolean {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe").remove();
  const textLen = $("body").text().replace(/\s+/g, " ").trim().length;
  if (textLen > 600) return false;
  return (
    /__NEXT_DATA__|__NUXT__|window\.__|id="root"|id="app"|data-reactroot|ng-version/i.test(
      html
    ) || /enable JavaScript|requires JavaScript/i.test(html)
  );
}

async function nativeFetch(url: URL, root: URL): Promise<{ status: number; html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("html")) {
      return { status: res.status, html: "", finalUrl: res.url || url.toString() };
    }
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
    const html = await res.text();
    if (html.length > MAX_BYTES) return null;
    // Redirect target may have left the safe set; re-validate the final host.
    let finalUrl = res.url || url.toString();
    try {
      const finalHost = new URL(finalUrl).hostname;
      if (finalHost !== root.hostname) await assertSafePublicUrl(finalUrl);
    } catch {
      finalUrl = url.toString();
    }
    return { status: res.status, html, finalUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function renderFetch(url: URL): Promise<{ status: number; html: string; finalUrl: string } | null> {
  const browser = await getBrowser();
  if (!browser) return null;
  let context: PwContext | null = null;
  try {
    context = await browser.newContext({
      userAgent: USER_AGENT,
      javaScriptEnabled: true,
      bypassCSP: true,
    });
    const page = await context.newPage();
    const response = await page.goto(url.toString(), {
      waitUntil: "networkidle",
      timeout: RENDER_TIMEOUT_MS,
    });
    const html = await page.content();
    const status = response?.status() ?? 0;
    const finalUrl = page.url();
    await page.close();
    return { status, html: html.slice(0, MAX_BYTES * 4), finalUrl };
  } catch (error) {
    console.error("[scraper] render failed", url.toString(), error instanceof Error ? error.message : error);
    return null;
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

/**
 * Fetch one page, optionally rendering with a headless browser. Returns null
 * when the URL is unsafe, disallowed by robots, or could not be retrieved.
 */
export async function fetchPage(
  input: string,
  opts: { render?: boolean } = {}
): Promise<FetchedPage | null> {
  let root: URL;
  try {
    root = await assertSafePublicUrl(input);
  } catch {
    return null;
  }
  if (!(await robotsAllows(root, root.pathname))) return null;

  return withDomainLock(root.hostname, async () => {
    let rendered = false;
    let result = await nativeFetch(root, root);

    const needsRender =
      renderingEnabled() &&
      (opts.render === true ||
        !result ||
        !result.html ||
        looksJsShell(result.html));

    if (needsRender) {
      const renderedResult = await renderFetch(root);
      if (renderedResult && renderedResult.html) {
        result = renderedResult;
        rendered = true;
      }
    }

    if (!result || !result.html) return null;

    const { title, text, links } = parseHtml(result.html, result.finalUrl);
    return {
      url: root.toString(),
      finalUrl: result.finalUrl,
      status: result.status,
      title,
      text,
      html: result.html,
      contentHash: createHash("sha256").update(result.html).digest("hex"),
      rendered,
      links,
    };
  });
}
