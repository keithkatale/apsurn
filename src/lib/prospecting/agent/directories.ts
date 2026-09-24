/**
 * Host exclusions and the directory_sources memory table.
 *
 * Left over from the LLM-driven directory scraper, which used to look up and
 * remember which directory sites had produced leads for similar ICPs. The
 * deterministic pipeline (agent/run.ts) doesn't scrape directories at all —
 * only `isExcludedHost` and `rememberDirectory` are still used, by
 * shared.ts's domain normalization and persist.ts's bookkeeping respectively.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProspectCriteria } from "../types";

/** Hosts we never scrape (ToS / anti-bot / not a lead source). */
export const EXCLUDED_DIRECTORY_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "tiktok.com",
  "youtube.com",
  "pinterest.com",
  "reddit.com",
  "quora.com",
  "glassdoor.com",
  "indeed.com",
  "zoominfo.com",
  "rocketreach.co",
  "apollo.io",
  "crunchbase.com",
  // Site builders and link-in-bio hosts. Icypeas sometimes returns these as a
  // "company website", then rejects the follow-up people lookup as an invalid
  // domain, so the run walks a page of nothing and saves zero companies.
  "canva.site",
  "wixsite.com",
  "wordpress.com",
  "github.io",
  "gitlab.io",
  "linktr.ee",
  "carrd.co",
  "notion.site",
  "notion.so",
  "webflow.io",
  "squarespace.com",
  "sites.google.com",
  "myshopify.com",
  "blogspot.com",
  "medium.com",
  "substack.com",
  "about.me",
  "bio.link",
  "beacons.ai",
  "godaddysites.com",
  "weebly.com",
  "jimdosite.com",
  "teachable.com",
  "podia.com",
  "gumroad.com",
  "etsy.com",
  "bit.ly",
  "linkin.bio",
];

export function isExcludedHost(host: string): boolean {
  const h = host.replace(/^www\./, "").toLowerCase();
  return EXCLUDED_DIRECTORY_HOSTS.some((bad) => h === bad || h.endsWith(`.${bad}`));
}

/** ICP tags used to remember/reuse productive directories. */
export function icpTags(criteria: ProspectCriteria): string[] {
  return [...criteria.industries, ...criteria.geographies]
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

/** Record that a directory host produced leads, for future reuse. */
export async function rememberDirectory(
  db: SupabaseClient,
  host: string,
  exampleUrl: string,
  criteria: ProspectCriteria
): Promise<void> {
  const clean = host.replace(/^www\./, "").toLowerCase();
  if (isExcludedHost(clean)) return;
  try {
    const { data: existing } = await db
      .from("directory_sources")
      .select("id, yield_count")
      .eq("host", clean)
      .maybeSingle();
    if (existing) {
      await db
        .from("directory_sources")
        .update({
          yield_count: (existing.yield_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await db.from("directory_sources").insert({
        host: clean,
        example_url: exampleUrl.slice(0, 1000),
        kind: "directory",
        icp_tags: icpTags(criteria),
        yield_count: 1,
        last_used_at: new Date().toISOString(),
      });
    }
  } catch {
    /* best-effort memory; never block a run */
  }
}
