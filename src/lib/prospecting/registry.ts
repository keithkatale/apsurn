import { directoryAgentSource } from "./sources/directory-agent";
import type { ProspectDataSource } from "./types";

/**
 * `directory_agent` is the only enabled data source: an autonomous
 * multi-step scraper over public business directories + company sites (see
 * src/lib/prospecting/agent/). The full run path is the agent loop invoked
 * by runProspecting; this registry's single consumer is the daily canonical
 * index refresh job (refreshProspectIndex).
 */
export function getEnabledDataSources(): ProspectDataSource[] {
  return [directoryAgentSource];
}
