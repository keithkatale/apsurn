import { webScrapeSource } from "./sources/web-scrape";
import type { ProspectDataSource } from "./types";

/**
 * Enabled prospecting data sources, in priority order. `web_scrape` is the
 * only one for MVP; a future paid enrichment provider (Clearbit/Apollo-style)
 * registers here with zero changes to callers — see the pluggable
 * `ProspectDataSource` interface in ./types.ts.
 */
export function getEnabledDataSources(): ProspectDataSource[] {
  return [webScrapeSource];
}
