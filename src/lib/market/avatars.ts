import * as cheerio from "cheerio";
import type { MarketPlatform } from "./types";

function cleanHandle(platform: MarketPlatform, handle: string): string {
  let h = handle.trim().replace(/^@/, "");
  if (platform === "reddit") h = h.replace(/^u\//i, "").replace(/^\/u\//i, "");
  return h;
}

async function redditAvatar(handle: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.reddit.com/user/${encodeURIComponent(handle)}/about.json`, {
      headers: { "User-Agent": "apsurn-market-insights/1.0 (by /u/apsurn)" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { icon_img?: string; snoovatar_img?: string } };
    const raw = json.data?.snoovatar_img || json.data?.icon_img;
    if (!raw) return null;
    // Reddit HTML-escapes the query string (e.g. &amp;) in this field.
    return raw.replace(/&amp;/g, "&");
  } catch {
    return null;
  }
}

/** YouTube channel pages render an og:image / image_src link tag server-side — no API key needed. */
async function youtubeAvatar(handle: string): Promise<string | null> {
  const path = handle.startsWith("@") || handle.startsWith("UC") ? handle : `@${handle}`;
  try {
    const res = await fetch(`https://www.youtube.com/${encodeURIComponent(path)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; apsurn-market-insights/1.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    const imageSrc = $('link[rel="image_src"]').attr("href");
    const ogImage = $('meta[property="og:image"]').attr("content");
    return imageSrc || ogImage || null;
  } catch {
    return null;
  }
}

/**
 * unavatar.io is a free, keyless avatar-aggregation proxy (no account/API
 * key required) that resolves a platform username to that platform's
 * current profile picture, with a generic-fallback image if it can't find
 * one. Used for platforms with no public unauthenticated avatar endpoint
 * of their own (X/Twitter). LinkedIn has no equivalent keyless option — its
 * API gates profile photo access behind partner approval — so it isn't
 * handled here and falls back to whatever the AI search happened to find.
 */
function unavatarUrl(provider: "twitter", handle: string): string {
  return `https://unavatar.io/${provider}/${encodeURIComponent(handle)}`;
}

/** Best-effort, keyless profile-picture lookup. Returns null if nothing reliable was found. */
export async function resolveAvatarUrl(platform: MarketPlatform, handle: string): Promise<string | null> {
  const clean = cleanHandle(platform, handle);
  if (!clean) return null;

  switch (platform) {
    case "reddit":
      return redditAvatar(clean);
    case "youtube":
      return youtubeAvatar(clean);
    case "twitter":
      return unavatarUrl("twitter", clean);
    case "linkedin":
      return null;
    default:
      return null;
  }
}
