/**
 * Commercial Real Estate Lead Generation Module for Node.js / Next.js (Apsurn)
 *
 * Exports:
 * - `LeadGenerator`: Generates 100 commercial real estate leads (contractors, land buyers, dual-match)
 * - `PermitDataEnricher`: Enriches PermitStack / city building permit data with state contractor licenses
 * - `LandPurchaseExtractor`: Enriches County Assessor commercial property transfers with SOS LLC lookups
 * - `realEstateDataSource`: Implements Apsurn's `ProspectDataSource` interface
 * - `findRealEstateCompanies`: Returns `ApsurnSourcedCompany[]` for Apsurn's `sources/index.ts`
 */

import { LeadGenerator } from "./lead-generator.ts";
import type {
  ApsurnCandidateCompany,
  ApsurnCandidateContact,
  ApsurnSourcedCompany,
} from "./types.ts";

export * from "./types.ts";
export * from "./csv-utils.ts";
export * from "./permit-extractor.ts";
export * from "./land-extractor.ts";
export * from "./lead-generator.ts";

export interface RealEstateSearchCriteria {
  industries?: string[];
  geographies?: string[];
  personas?: string[];
  state?: string;
  leadType?: "contractors" | "buyers" | "blended" | "all";
  limit?: number;
}

const VALID_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

function extractStatesFromGeographies(geographies?: string[], explicitState?: string): string[] | undefined {
  const states: string[] = [];
  if (explicitState) {
    const code = explicitState.trim().toUpperCase();
    if (VALID_STATE_CODES.has(code)) states.push(code);
  }
  for (const geo of geographies ?? []) {
    const tokens = geo.toUpperCase().split(/[^A-Z]+/);
    for (const token of tokens) {
      if (VALID_STATE_CODES.has(token) && !states.includes(token)) {
        states.push(token);
      }
    }
  }
  return states.length > 0 ? states : undefined;
}

/**
 * Plug-in helper for Apsurn's `src/lib/prospecting/sources/index.ts`
 */
export async function findRealEstateCompanies(
  opts: RealEstateSearchCriteria = {},
): Promise<ApsurnSourcedCompany[]> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 100));
  const states = extractStatesFromGeographies(opts.geographies, opts.state);
  const generator = new LeadGenerator();

  const leadType = opts.leadType ?? "all";
  if (leadType === "contractors") {
    const leads = generator.generatePermitContractors(limit, states);
    return generator.toSourcedCompanies(leads);
  }
  if (leadType === "buyers") {
    const leads = generator.generateLandBuyers(limit, states);
    return generator.toSourcedCompanies(leads);
  }
  if (leadType === "blended") {
    const leads = generator.generateBlendedLeads(limit, states);
    return generator.toSourcedCompanies(leads);
  }

  const contractorCount = Math.round(limit * 0.4);
  const buyerCount = Math.max(0, limit - contractorCount);
  const { allLeads } = generator.generateAllLeads({
    contractorCount,
    buyerCount,
    blendedCount: 0,
    states,
  });

  return generator.toSourcedCompanies(allLeads);
}

/**
 * Implements Apsurn's `ProspectDataSource` interface (`src/lib/prospecting/types.ts`)
 * so it can be registered directly in `src/lib/prospecting/registry.ts`.
 */
export const realEstateDataSource = {
  id: "real_estate_leads",

  async findCompanies(
    criteria: { industries: string[]; geographies: string[]; personas?: string[] },
    opts: { limit: number },
  ): Promise<ApsurnCandidateCompany[]> {
    const states = extractStatesFromGeographies(criteria.geographies);
    const generator = new LeadGenerator();
    const limit = Math.max(1, opts.limit);
    const contractorCount = Math.round(limit * 0.4);
    const buyerCount = Math.max(0, limit - contractorCount);

    const { allLeads } = generator.generateAllLeads({
      contractorCount,
      buyerCount,
      blendedCount: 0,
      states,
    });

    return generator.toCandidateCompaniesAndContacts(allLeads).map((pair) => pair.company);
  },

  async findContacts(
    company: ApsurnCandidateCompany,
    _criteria: { industries: string[]; geographies: string[]; personas?: string[] },
    opts: { limit: number },
  ): Promise<ApsurnCandidateContact[]> {
    const generator = new LeadGenerator();
    const state = company.location?.split(",")[1]?.trim() || "CA";
    const sample = generator.generatePermitContractors(Math.max(1, opts.limit), [state]);
    return generator.toCandidateCompaniesAndContacts(sample).map((pair) => ({
      ...pair.contact,
      email: `info@${company.domain}`,
      location: company.location,
    }));
  },
};
