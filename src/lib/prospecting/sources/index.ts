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

import { overpassBusinesses, redditLaunchCompanies, remoteOkCompanies, weWorkRemotelyCompanies } from "./community";
import { fmcsaCarriers, npiOrganizations } from "./registries";
import { arbeitnowCompanies, remotiveCompanies, ycCompanies } from "./startups";
import { toStateCode, translateGeoTokens, translateYcTerms } from "./vocabulary";
import { findRealEstateCompanies } from "../real-estate";
import type { SourcedCompany } from "./types";

export type { SourcedCompany } from "./types";
export { findAtsBoard, matchRoles, type AtsBoard, type AtsRole } from "./ats";
export { normalizeDomain } from "./client";
export { ycCompanies, ycCount, ycVocabulary, type YcFilter } from "./startups";
export { findRealEstateCompanies } from "../real-estate";
export * from "./vocabulary";

export const LEAD_SOURCE_IDS = [
  "yc",
  "remote_ok",
  "we_work_remotely",
  "reddit_launches",
  "openstreetmap",
  "arbeitnow",
  "remotive",
  "npi_healthcare",
  "fmcsa_trucking",
  "real_estate_commercial",
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
    id: "remote_ok",
    archetype: "listed",
    label: "Remote OK",
    bestFor: "Companies with a public Remote OK job. The job URL is kept and the board is named. No founder is inferred.",
    namesAHuman: false,
  },
  {
    id: "we_work_remotely",
    archetype: "listed",
    label: "We Work Remotely",
    bestFor: "Companies posting on the We Work Remotely RSS feed. The job URL is kept and the board is named.",
    namesAHuman: false,
  },
  {
    id: "reddit_launches",
    archetype: "listed",
    label: "Reddit launches",
    bestFor: "Launch posts on r/startups, r/SaaS, r/indiehackers and r/smallbusiness. The company is the outbound link, not the poster.",
    namesAHuman: false,
  },
  {
    id: "openstreetmap",
    archetype: "listed",
    label: "OpenStreetMap",
    bestFor: "Local businesses in a city: name, website, phone and street address from OpenStreetMap. No founders or LinkedIn.",
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
  {
    id: "real_estate_commercial",
    archetype: "licensed",
    label: "Commercial Real Estate Permits & Deeds",
    bestFor:
      "Commercial contractors with active building permits and LLC buyers of commercial land/property. Carries phone numbers, verified emails, permit valuations and deed values.",
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

/** Drops the source's own name so "remote ok react" filters on "react", and an unnamed query stays unfiltered. */
function topicKeywords(words: string[] | undefined, noise: RegExp): string[] {
  const pattern = new RegExp(noise.source, noise.flags.includes("g") ? noise.flags : `${noise.flags}g`);
  return (words ?? [])
    .join(" ")
    .replace(pattern, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 2);
}

function osmPlace(opts: FindCompaniesOptions): string {
  const named = (opts.geographies ?? []).find((place) => place.trim());
  if (named) return named.trim();
  return topicKeywords(opts.keywords, /\b(openstreetmap|overpass|osm|local businesses?|google maps|maps)\b/gi).join(" ");
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

    case "remote_ok":
      return remoteOkCompanies(topicKeywords(opts.keywords, /\bremote\s*ok\b|\bjobs?\b/gi), limit);

    case "we_work_remotely":
      return weWorkRemotelyCompanies(topicKeywords(opts.keywords, /\bwe work remotely\b|\bwwr\b|\bjobs?\b/gi), limit);

    case "reddit_launches":
      return redditLaunchCompanies(topicKeywords(opts.keywords, /\breddit\b|\blaunches?\b|\br\/\w+/gi), limit);

    case "openstreetmap":
      return overpassBusinesses(
        osmPlace(opts),
        opts.taxonomy ?? opts.industries?.[0] ?? "office",
        limit,
      );

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

    case "real_estate_commercial":
      return findRealEstateCompanies({
        geographies: opts.geographies,
        state: opts.state ? (toStateCode(opts.state) ?? opts.state) : undefined,
        limit,
      });

    case "fmcsa_trucking":
      return fmcsaCarriers({ state: opts.state ? (toStateCode(opts.state) ?? opts.state) : undefined, limit });

    default:
      return [];
  }
}
