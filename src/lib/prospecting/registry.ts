import { directoryAgentSource } from "./sources/directory-agent";
import { realEstateDataSource } from "./real-estate";
import type { ProspectDataSource } from "./types";

/**
 * Enabled data sources:
 * 1. directoryAgentSource: autonomous multi-step scraper over public business directories + company sites.
 * 2. realEstateDataSource: commercial real estate building permits & property deed buyers.
 */
export function getEnabledDataSources(): ProspectDataSource[] {
  return [directoryAgentSource, realEstateDataSource];
}
