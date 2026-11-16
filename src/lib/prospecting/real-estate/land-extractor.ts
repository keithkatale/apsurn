/**
 * Extract Commercial Land Purchases + Buyer Contact Info (Node.js / Next.js)
 * Ported from `Code Scripts/extract_land_purchases.py` and `API_REFERENCE.md`.
 *
 * Uses County Assessor property transfer records + Secretary of State LLC registries.
 */

import * as fs from "node:fs/promises";
import { parseCsvRecords, recordsToCsv } from "./csv-utils.ts";
import type {
  ApsurnSourcedCompany,
  BuyerEntityType,
  CommercialPropertyRecord,
  ContactResearchStatus,
} from "./types.ts";

export interface CountyAssessorSource {
  url: string;
  method: "web_portal" | "web_portal + api" | "api";
  filter: string;
  coverage: string;
  freshness: string;
  apiEndpoint?: string;
}

export const COUNTY_SOURCES: Record<string, CountyAssessorSource> = {
  "Los Angeles, CA": {
    url: "https://assessor.lacounty.gov/",
    method: "web_portal",
    filter: "Property Type = Commercial, Sales Date >= 90 days ago",
    coverage: "2.6M properties",
    freshness: "30-90 days",
  },
  "Harris (Houston), TX": {
    url: "https://www.hcad.org/property-search-landing-page",
    method: "web_portal",
    filter: "Property Type Code = C (Commercial)",
    coverage: "1.3M properties",
    freshness: "30-60 days",
  },
  "Cook (Chicago), IL": {
    url: "https://www.cookcountyassessoril.gov/",
    method: "web_portal",
    filter: "Property Class = Commercial",
    coverage: "2.6M properties",
    freshness: "30-90 days",
  },
  "NYC (All 5 Boroughs), NY": {
    url: "https://www.nyc.gov/html/dcp/html/acris/acris.shtml",
    method: "web_portal + api",
    filter: "Document Type = DEED (commercial deeds)",
    coverage: "2.1M properties",
    freshness: "1-7 days (BEST)",
    apiEndpoint: "https://data.cityofnewyork.us/resource/bnx9-e6tj.json",
  },
  "Maricopa (Phoenix), AZ": {
    url: "https://assessor.maricopa.gov/",
    method: "web_portal",
    filter: "Property Use = Commercial",
    coverage: "1.8M properties",
    freshness: "30-90 days",
  },
  "Clark (Las Vegas), NV": {
    url: "https://assessor.clarkcountynv.us/",
    method: "web_portal",
    filter: "Property Type = Commercial",
    coverage: "1.2M properties",
    freshness: "30-60 days",
  },
};

export const SOS_REGISTRIES: Record<string, string> = {
  CA: "https://bizfileonline.sos.ca.gov/search/business",
  TX: "https://www.sos.state.tx.us/corp/sosda/index.shtml",
  NY: "https://apps.dos.ny.gov/publicInquiry/",
  IL: "https://apps.ilsos.gov/businessentitysearch/",
  FL: "https://search.sunbiz.org/Inquiry/CorporationSearch/ByName",
  AZ: "https://ecorp.azcc.gov/EntitySearch/Index",
  NV: "https://esos.nv.gov/EntitySearch/OnlineEntitySearch",
  PA: "https://file.dos.pa.gov/search/business",
  OH: "https://businesssearch.ohiosecretaryofstate.gov/",
  GA: "https://ecorp.sos.ga.gov/BusinessSearch",
  NC: "https://www.sosnc.gov/online_services/search/by_title/_Business_Registration",
  CO: "https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do",
  WA: "https://ccfs.sos.wa.gov/#/BusinessSearch",
};

const ENTITY_SUFFIX_TOKENS = ["LLC", "L.L.C.", "CORP", "INC", "LP", "L.P.", "LLP", "TRUST", "HOLDINGS", "PARTNERS", "PROPERTIES", "GROUP"];

export class LandPurchaseExtractor {
  /**
   * Classify whether a buyer name is a business entity (LLC/Corp/LP/Trust) or an individual
   */
  classifyBuyerType(buyerName: string): BuyerEntityType {
    const upper = buyerName.toUpperCase();
    const isEntity = ENTITY_SUFFIX_TOKENS.some((token) => {
      const escaped = token.replace(/\./g, "\\.");
      return new RegExp(`\\b${escaped}\\b`).test(upper);
    });
    return isEntity ? "Business Entity (likely LLC/Corp)" : "Individual";
  }

  /**
   * Step-by-step instructions for accessing a specific county assessor database
   */
  getCountySourceInstructions(county: string, state: string) {
    const key = `${county}, ${state}`;
    const source = COUNTY_SOURCES[key];

    if (source) {
      return {
        county,
        state,
        url: source.url,
        method: source.method,
        steps: [
          `1. Visit ${source.url}`,
          "2. Search for property sales or property transfer records",
          `3. Filter: ${source.filter}`,
          "4. Filter date: Last 30-90 days",
          "5. Export results to CSV",
          "6. Run LandPurchaseExtractor on exported CSV",
        ],
        filter_instructions: source.filter,
        freshness: source.freshness,
        coverage: source.coverage,
      };
    }

    return {
      county,
      state,
      method: "generic" as const,
      steps: [
        `1. Search: '${county} County ${state} assessor property search'`,
        "2. Access online property records",
        "3. Filter for commercial properties sold in the last 30-90 days",
        "4. Export data to CSV",
        "5. Run LandPurchaseExtractor on exported CSV",
      ],
    };
  }

  /**
   * Instructions and registry URL for looking up an LLC in the Secretary of State business registry
   */
  extractLlcInfoFromSos(llcName: string, state: string) {
    const normalizedState = state.trim().toUpperCase();
    const sosUrl =
      SOS_REGISTRIES[normalizedState] ??
      `[Search '${normalizedState} Secretary of State Business Entity Search']`;

    return {
      llc_name: llcName,
      state: normalizedState,
      sos_url: sosUrl,
      instructions: [
        `1. Visit: ${sosUrl}`,
        `2. Search for: ${llcName}`,
        "3. Extract available info:",
        "   - Registered agent name and address",
        "   - Manager(s)/organizer name(s)",
        "   - Formation date & entity status",
      ],
      contact_fields_available: [
        "registered_agent_name",
        "registered_agent_address",
        "registered_agent_phone (sometimes)",
        "manager_name",
        "organizer_name",
        "organizer_email (sometimes)",
      ],
    };
  }

  /**
   * Enrich raw property transfer records with buyer entity classification and SOS lookup steps
   */
  enrichPropertyRecords(
    rawRows: Array<Partial<CommercialPropertyRecord>>,
    county: string,
    state: string,
  ): CommercialPropertyRecord[] {
    const normalizedState = state.trim().toUpperCase();

    return rawRows.map((row) => {
      const buyerName = (row.buyer_name ?? "").trim();
      const buyerType = this.classifyBuyerType(buyerName);
      const contactStatus: ContactResearchStatus =
        buyerType === "Business Entity (likely LLC/Corp)"
          ? "lookup_in_SOS"
          : "google_search_recommended";

      const nextStep =
        buyerType === "Business Entity (likely LLC/Corp)"
          ? `Lookup '${buyerName}' in ${normalizedState} Secretary of State (${SOS_REGISTRIES[normalizedState] ?? "SOS portal"})`
          : `Google '${buyerName}' in ${county} County, ${normalizedState}`;

      return {
        property_address: (row.property_address ?? "").trim(),
        county,
        state: normalizedState,
        sale_date: (row.sale_date ?? "").trim(),
        sale_price: (row.sale_price ?? "").trim(),
        buyer_name: buyerName,
        buyer_type: buyerType,
        seller_name: (row.seller_name ?? "").trim(),
        property_type: (row.property_type ?? "Commercial").trim(),
        zoning: (row.zoning ?? "").trim(),
        assessed_value: (row.assessed_value ?? "").trim(),
        contact_status: contactStatus,
        next_step: nextStep,
      };
    });
  }

  /**
   * Process county property transfer CSV string and return enriched records + CSV string
   */
  processCountyExportCsv(
    csvContent: string,
    county: string,
    state: string,
  ): {
    records: CommercialPropertyRecord[];
    csv: string;
    stats: { total: number; businessEntities: number; individuals: number };
  } {
    const parsed = parseCsvRecords(csvContent);
    const records = this.enrichPropertyRecords(parsed, county, state);

    const columns = [
      "property_address",
      "county",
      "state",
      "sale_date",
      "sale_price",
      "buyer_name",
      "buyer_type",
      "seller_name",
      "property_type",
      "zoning",
      "assessed_value",
      "contact_status",
      "next_step",
    ];

    const businessEntities = records.filter(
      (r) => r.buyer_type === "Business Entity (likely LLC/Corp)",
    ).length;

    return {
      records,
      csv: recordsToCsv(records, columns),
      stats: {
        total: records.length,
        businessEntities,
        individuals: records.length - businessEntities,
      },
    };
  }

  /**
   * Process county property transfer CSV file on disk and write enriched CSV file
   */
  async processCountyExportFile(
    inputFile: string,
    county: string,
    state: string,
    outputFile: string,
  ): Promise<CommercialPropertyRecord[]> {
    const content = await fs.readFile(inputFile, "utf-8");
    const { records, csv } = this.processCountyExportCsv(content, county, state);
    if (records.length > 0) {
      await fs.writeFile(outputFile, csv, "utf-8");
    }
    return records;
  }

  /**
   * Convert enriched commercial property purchase records into Apsurn's `SourcedCompany` format
   */
  toSourcedCompanies(records: CommercialPropertyRecord[]): ApsurnSourcedCompany[] {
    return records
      .filter((r) => r.buyer_name.trim().length > 0)
      .map((r) => {
        const isEntity = r.buyer_type === "Business Entity (likely LLC/Corp)";
        return {
          name: r.buyer_name,
          domain: null,
          description: `${r.property_type || "Commercial Property"} acquisition at ${r.property_address}`,
          location: `${r.county}, ${r.state}`,
          employeeBand: null,
          phone: null,
          contactName: isEntity ? null : r.buyer_name,
          contactTitle: isEntity ? "Registered Agent / Managing Member" : "Property Owner",
          source: "County Assessor + Secretary of State Registry",
          sourceUrl: SOS_REGISTRIES[r.state] ?? null,
          signal: "Recent commercial property acquisition",
          signalEvidence: `Purchased ${r.property_address} for ${r.sale_price || "undisclosed"} on ${r.sale_date}`,
          signalDate: r.sale_date || null,
        };
      });
  }
}
