/**
 * Archetype routing for lead sources.
 *
 * One question decides where a company's canonical list lives: is the buyer
 * licensed, listed, located, or logged in? Answering it first is what stops
 * the agent scraping HTML directories for buyers a government registry
 * publishes as JSON — which is exactly what it was doing when it read
 * builtin.com company pages and found nobody.
 *
 * Preference order is always registry > directory > scrape. Registry data is
 * complete, free and frequently names a human outright; scraped data is
 * partial, fragile, and often behind Cloudflare. Fighting a bot wall is a
 * sign the routing is wrong, not a reason to try harder.
 */

import { fmcsaCarriers, npiOrganizations } from "./registries";
import { arbeitnowCompanies, remotiveCompanies, ycCompanies } from "./startups";
import { toStateCode, translateGeoTokens, translateYcTerms } from "./vocabulary";
import type { SourcedCompany } from "./types";

export type { SourcedCompany } from "./types";
export { findAtsBoard, matchRoles, type AtsBoard, type AtsRole } from "./ats";
export { normalizeDomain } from "./client";
export { ycCompanies, ycCount, ycVocabulary, type YcFilter } from "./startups";
export * from "./vocabulary";

export const LEAD_SOURCE_IDS = [
  "yc",
  "arbeitnow",
  "remotive",
  "npi_healthcare",
  "fmcsa_trucking",
] as const;

export type LeadSourceId = (typeof LEAD_SOURCE_IDS)[number];

export interface LeadSourceDescriptor {
  id: LeadSourceId;
  archetype: "listed" | "licensed";
  label: string;
  /** What the agent needs to know to choose it. Surfaced in the tool description. */
  bestFor: string;
  namesAHuman: boolean;
}

export const LEAD_SOURCES: LeadSourceDescriptor[] = [
  {
    id: "yc",
    archetype: "listed",
    label: "Y Combinator directory",
    bestFor: "B2B SaaS, AI, fintech, devtools and other venture-backed software companies. Carries a live hiring flag, team size and stage.",
    namesAHuman: false,
  },
  {
    id: "arbeitnow",
    archetype: "listed",
    label: "Arbeitnow job board",
    bestFor: "European (especially German-speaking) companies with open roles. Their sites carry a legally required public contact email.",
    namesAHuman: false,
  },
  {
    id: "remotive",
    archetype: "listed",
    label: "Remotive",
    bestFor: "Remote-first software companies with open roles.",
    namesAHuman: false,
  },
  {
    id: "npi_healthcare",
    archetype: "licensed",
    label: "CMS NPI Registry",
    bestFor:
      "Any US healthcare organisation — dental practices, clinics, physical therapy, home health, pharmacies, behavioural health. Names the practice's authorised official and gives a phone number.",
    namesAHuman: true,
  },
  {
    id: "fmcsa_trucking",
    archetype: "licensed",
    label: "FMCSA carrier census",
    bestFor: "US trucking, logistics and fleet operators. Includes fleet size and often a named company officer.",
    namesAHuman: true,
  },
];

export interface FindCompaniesOptions {
  source: LeadSourceId;
  industries?: string[];
  geographies?: string[];
  keywords?: string[];
  /** NPI only: the provider taxonomy, e.g. "dentist", "physical therapy". */
  taxonomy?: string;
  /** Two-letter US state, for the registry sources. */
  state?: string;
  hiringOnly?: boolean;
  minTeamSize?: number;
  maxTeamSize?: number;
  limit?: number;
}

export async function findCompanies(opts: FindCompaniesOptions): Promise<SourcedCompany[]> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));

  switch (opts.source) {
    case "yc":
      // Legacy free-text adapter. YC's taxonomy is a closed set, so raw ICP
      // wording is mapped onto it rather than matched against it — see
      // translateYcTerms. Callers that already know the exact vocabulary
      // (the pipeline's TRANSLATE stage) should call ycCompanies directly.
      return ycCompanies({
        ...translateYcTerms(opts.industries ?? [], opts.keywords ?? []),
        locationTokens: translateGeoTokens(opts.geographies ?? []),
        hiringOnly: opts.hiringOnly,
        minTeamSize: opts.minTeamSize,
        maxTeamSize: opts.maxTeamSize,
        limit,
      });

    case "arbeitnow":
      return arbeitnowCompanies({ keywords: opts.keywords ?? opts.industries, limit });

    case "remotive":
      return remotiveCompanies({ keywords: opts.keywords ?? opts.industries, limit });

    case "npi_healthcare":
      return npiOrganizations({
        // The taxonomy is the vertical filter; fall back to whatever industry
        // wording the caller had, since CMS matches on description text.
        taxonomy: opts.taxonomy ?? opts.industries?.[0] ?? "",
        state: opts.state ? (toStateCode(opts.state) ?? opts.state) : undefined,
        limit,
      });

    case "fmcsa_trucking":
      return fmcsaCarriers({ state: opts.state ? (toStateCode(opts.state) ?? opts.state) : undefined, limit });

    default:
      return [];
  }
}
