/**
 * Government registries: the "licensed" archetype.
 *
 * These are the highest-yield free sources and almost nobody uses them,
 * because they take a few minutes to understand. Unlike a scraped directory
 * they are complete, structured, legally public, and — crucially — several
 * of them name a human outright. That closes the gap that makes the scraping
 * agent fail on small businesses: a dental practice's website rarely lists
 * the owner, but CMS publishes the practice's authorised official by name.
 *
 * Verified live against both APIs while writing this.
 */

import { fetchJsonOrThrow, normalizeDomain, tidyName } from "./client";
import type { SourcedCompany } from "./types";

interface NpiAddress {
  address_purpose?: string;
  address_1?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  telephone_number?: string;
  country_name?: string;
}

interface NpiResult {
  number?: number;
  basic?: {
    organization_name?: string;
    authorized_official_first_name?: string;
    authorized_official_last_name?: string;
    authorized_official_title_or_position?: string;
    authorized_official_telephone_number?: string;
  };
  addresses?: NpiAddress[];
  taxonomies?: Array<{ desc?: string; primary?: boolean }>;
}

/**
 * CMS National Provider Identifier registry — every US healthcare provider
 * and organisation. `enumeration_type=NPI-2` restricts to organisations
 * (practices, clinics, agencies) rather than individual clinicians, and the
 * organisation record carries its authorised official's name and title.
 *
 * `taxonomy_description` is the vertical filter: "dentist", "physical
 * therapy", "home health", "pharmacy", "behavioral health", and so on.
 */
export async function npiOrganizations(opts: {
  taxonomy: string;
  state?: string;
  city?: string;
  limit?: number;
}): Promise<SourcedCompany[]> {
  const params = new URLSearchParams({
    version: "2.1",
    enumeration_type: "NPI-2",
    taxonomy_description: opts.taxonomy,
    limit: String(Math.min(200, Math.max(1, opts.limit ?? 50))),
  });
  if (opts.state) params.set("state", opts.state);
  if (opts.city) params.set("city", opts.city);

  const data = await fetchJsonOrThrow<{ results?: NpiResult[] }>(`https://npiregistry.cms.hhs.gov/api/?${params.toString()}`);
  if (!data?.results?.length) return [];

  return data.results.flatMap((result): SourcedCompany[] => {
    const name = tidyName(result.basic?.organization_name);
    if (!name) return [];

    const location =
      result.addresses?.find((a) => a.address_purpose === "LOCATION") ?? result.addresses?.[0] ?? {};
    const first = tidyName(result.basic?.authorized_official_first_name);
    const last = tidyName(result.basic?.authorized_official_last_name);
    const contactName = [first, last].filter(Boolean).join(" ") || null;
    const taxonomy = result.taxonomies?.find((t) => t.primary)?.desc ?? result.taxonomies?.[0]?.desc ?? opts.taxonomy;

    return [
      {
        name,
        domain: null, // Registries carry no website; resolved later, only if the row scores.
        description: taxonomy ?? null,
        location: [tidyName(location.city), location.state].filter(Boolean).join(", ") || null,
        employeeBand: null,
        phone: location.telephone_number ?? result.basic?.authorized_official_telephone_number ?? null,
        contactName,
        contactTitle: tidyName(result.basic?.authorized_official_title_or_position) || null,
        source: "CMS NPI Registry",
        sourceUrl: result.number ? `https://npiregistry.cms.hhs.gov/provider-view/${result.number}` : null,
        signal: null,
        signalEvidence: null,
        signalDate: null,
      },
    ];
  });
}

interface FmcsaCarrier {
  dot_number?: string;
  legal_name?: string;
  dba_name?: string;
  phy_city?: string;
  phy_state?: string;
  phone?: string;
  power_units?: string;
  truck_units?: string;
  driver_total?: string;
  company_officer_1?: string;
  carrier_operation?: string;
}

/**
 * FMCSA motor carrier census — every US trucking company, with fleet size
 * (a clean firmographic filter) and often a named company officer.
 */
export async function fmcsaCarriers(opts: {
  state?: string;
  minPowerUnits?: number;
  maxPowerUnits?: number;
  limit?: number;
}): Promise<SourcedCompany[]> {
  const clauses: string[] = [];
  if (opts.state) clauses.push(`phy_state='${opts.state.toUpperCase().replace(/'/g, "")}'`);
  if (opts.minPowerUnits !== undefined) clauses.push(`power_units >= ${Math.max(0, Math.floor(opts.minPowerUnits))}`);
  if (opts.maxPowerUnits !== undefined) clauses.push(`power_units <= ${Math.max(0, Math.floor(opts.maxPowerUnits))}`);

  const params = new URLSearchParams({ $limit: String(Math.min(200, Math.max(1, opts.limit ?? 50))) });
  if (clauses.length > 0) params.set("$where", clauses.join(" AND "));

  const data = await fetchJsonOrThrow<FmcsaCarrier[]>(`https://data.transportation.gov/resource/az4n-8mr2.json?${params.toString()}`);
  if (!Array.isArray(data)) return [];

  return data.flatMap((carrier): SourcedCompany[] => {
    const name = tidyName(carrier.legal_name || carrier.dba_name);
    if (!name) return [];
    const units = Number(carrier.power_units ?? carrier.truck_units ?? "");

    return [
      {
        name,
        domain: null,
        description: carrier.carrier_operation ? `Motor carrier (${carrier.carrier_operation})` : "Motor carrier",
        location: [tidyName(carrier.phy_city), carrier.phy_state].filter(Boolean).join(", ") || null,
        employeeBand: Number.isFinite(units) && units > 0 ? `${units} power units` : null,
        phone: carrier.phone ?? null,
        contactName: tidyName(carrier.company_officer_1) || null,
        contactTitle: carrier.company_officer_1 ? "Company officer" : null,
        source: "FMCSA carrier census",
        sourceUrl: carrier.dot_number
          ? `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&original_query_param=NAME&query_string=${carrier.dot_number}`
          : null,
        signal: null,
        signalEvidence: null,
        signalDate: null,
      },
    ];
  });
}

/** Normalises whatever a registry gave us into a domain, when it gave one at all. */
export function withDomain(company: SourcedCompany, websiteUrl: string | null): SourcedCompany {
  return { ...company, domain: normalizeDomain(websiteUrl) };
}
