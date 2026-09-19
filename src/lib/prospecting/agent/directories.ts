/**
 * Public directory registry for the scraping agent.
 *
 * The agent does not rely on per-site CSS selectors — extraction is LLM-driven,
 * so any public listing works. This module just gives the agent good starting
 * points: a small seed of scrape-friendly directory types, plus a helper to
 * remember directories that produced leads (directory_sources table).
 *
 * Social networks and ToS-hostile scrapers are explicitly excluded.
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
];

export function isExcludedHost(host: string): boolean {
  const h = host.replace(/^www\./, "").toLowerCase();
  return EXCLUDED_DIRECTORY_HOSTS.some((bad) => h === bad || h.endsWith(`.${bad}`));
}

/**
 * Seed search phrases that tend to surface public member lists / directories
 * for a given ICP. The agent runs these (or its own variants) through
 * web_search, then opens the listing pages.
 */
export function seedDirectoryQueries(criteria: ProspectCriteria): string[] {
  const industries = criteria.industries.length ? criteria.industries : ["B2B"];
  const geos = criteria.geographies.length ? criteria.geographies : [""];
  const queries: string[] = [];

  for (const industry of industries.slice(0, 3)) {
    for (const geo of geos.slice(0, 2)) {
      const where = geo ? ` in ${geo}` : "";
      queries.push(`${industry} companies directory${where}`);
      queries.push(`${industry} industry association member list${where}`);
      queries.push(`chamber of commerce ${industry} members${where}`);
      queries.push(`list of ${industry} companies${where}`);
    }
  }

  return [...new Set(queries)].slice(0, 12);
}

/** ICP tags used to remember/reuse productive directories. */
export function icpTags(criteria: ProspectCriteria): string[] {
  return [...criteria.industries, ...criteria.geographies]
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}

/** Previously productive directories for this ICP (best-effort; never throws). */
export async function knownDirectories(
  db: SupabaseClient,
  criteria: ProspectCriteria,
  limit = 10
): Promise<Array<{ host: string; exampleUrl: string | null }>> {
  try {
    const tags = icpTags(criteria);
    let q = db
      .from("directory_sources")
      .select("host, example_url, yield_count")
      .order("yield_count", { ascending: false })
      .limit(limit);
    if (tags.length) q = q.overlaps("icp_tags", tags);
    const { data } = await q;
    return (data ?? [])
      .filter((d) => !isExcludedHost(d.host))
      .map((d) => ({ host: d.host, exampleUrl: d.example_url }));
  } catch {
    return [];
  }
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
