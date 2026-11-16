/**
 * Extract Construction Permits + Contractor Contact Info (Node.js / Next.js)
 * Ported from `Code Scripts/extract_construction_permits.py` and `API_REFERENCE.md`.
 *
 * Combines:
 * 1. PermitStack API (`https://permit-stack.com/api/v1`)
 * 2. City Socrata Open Data Building Permit APIs (LA, Chicago, Austin, Seattle, NYC)
 * 3. State Contractor Licensing Databases & ContractorLicenseCheck enrichment
 */

import * as fs from "node:fs/promises";
import { parseCsvRecords, recordsToCsv } from "./csv-utils.ts";
import type { EnrichedPermitRecord, RawPermitRecord, ApsurnSourcedCompany } from "./types.ts";

export interface StateContractorDatabaseInfo {
  name: string;
  url: string;
  searchPath?: string;
  type: "web_portal" | "api";
}

export const STATE_CONTRACTOR_DATABASES: Record<string, StateContractorDatabaseInfo> = {
  CA: {
    name: "California Contractors State License Board (CSLB)",
    url: "https://www.cslb.ca.gov/OnlineServices/CheckLicenseII/CheckLicense.aspx",
    searchPath: "/public-services/look-license",
    type: "web_portal",
  },
  TX: {
    name: "Texas Department of Licensing and Regulation (TDLR)",
    url: "https://www.tdlr.texas.gov/LicenseSearch/",
    type: "web_portal",
  },
  FL: {
    name: "Florida Department of Business and Professional Regulation (DBPR)",
    url: "https://www.myfloridalicense.com/wl11.asp",
    type: "web_portal",
  },
  NY: {
    name: "New York Department of State - Licensing",
    url: "https://appext20.dos.ny.gov/lcns_public/bus_name_inq_frm",
    type: "web_portal",
  },
  AZ: {
    name: "Arizona Registrar of Contractors (ROC)",
    url: "https://roc.az.gov/contractor-search",
    type: "web_portal",
  },
  CO: {
    name: "Colorado Department of Regulatory Agencies (DORA)",
    url: "https://apps.colorado.gov/dora/licensing/Lookup/LicenseLookup.aspx",
    type: "web_portal",
  },
  GA: {
    name: "Georgia Secretary of State - Professional Licensing",
    url: "https://verify.sos.ga.gov/verification/",
    type: "web_portal",
  },
  IL: {
    name: "Illinois Department of Financial and Professional Regulation (IDFPR)",
    url: "https://online-dfpr.micropact.com/lookup/licenselookup.aspx",
    type: "web_portal",
  },
  NC: {
    name: "North Carolina Licensing Board for General Contractors",
    url: "https://portal.nclbgc.org/Public/Search",
    type: "web_portal",
  },
  PA: {
    name: "Pennsylvania Attorney General Home Improvement Contractor Registry",
    url: "https://hicsearch.attorneygeneral.gov/",
    type: "web_portal",
  },
  WA: {
    name: "Washington Department of Labor & Industries - Verify a Contractor",
    url: "https://secure.lni.wa.gov/verify/",
    type: "web_portal",
  },
};

export interface PermitStackQuery {
  state: string;
  permit_type?: string;
  issue_date_start?: string;
  issue_date_end?: string;
  min_value?: number;
  max_value?: number;
  city?: string;
  limit?: number;
  offset?: number;
  sort_by?: "issue_date" | "estimated_cost";
}

export interface PermitStackApiPermit {
  id: string;
  permit_number: string;
  jurisdiction?: string;
  address: string;
  zip_code?: string;
  permit_type: string;
  permit_category?: string;
  contractor?: {
    name?: string;
    license_number?: string;
    phone?: string;
    email?: string;
    address?: string;
  };
  owner?: {
    name?: string;
    address?: string;
  };
  description?: string;
  estimated_cost?: number;
  issue_date: string;
  current_status?: string;
}

export class PermitDataEnricher {
  private readonly apiKey: string | null;
  private readonly baseUrl: string;

  constructor(opts?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = opts?.apiKey ?? process.env.PERMITSTACK_API_KEY?.trim() ?? null;
    this.baseUrl = (opts?.baseUrl ?? process.env.PERMITSTACK_API_BASE ?? "https://permit-stack.com/api/v1").replace(
      /\/$/,
      "",
    );
  }

  /**
   * Search for contractor license info instructions on ContractorLicenseCheck.com
   */
  searchContractorLicense(contractorName: string, state: string) {
    return {
      contractor_name: contractorName,
      state,
      status: "requires_manual_lookup" as const,
      instructions: `Visit https://contractorlicensecheck.com/, search for '${contractorName}' in ${state}`,
      lookup_url: "https://contractorlicensecheck.com/",
    };
  }

  /**
   * Resolve state-specific public contractor licensing database
   */
  searchStateContractorDatabase(contractorName: string, state: string) {
    const normalizedState = state.trim().toUpperCase();
    const db = STATE_CONTRACTOR_DATABASES[normalizedState];

    if (db) {
      return {
        contractor_name: contractorName,
        state: normalizedState,
        database: db.name,
        url: db.url,
        method: "web_portal" as const,
        instructions: `Search '${contractorName}' at ${db.url}`,
      };
    }

    return {
      contractor_name: contractorName,
      state: normalizedState,
      database: `${normalizedState} State Contractor Licensing Board`,
      url: "https://contractorlicensecheck.com/",
      method: "google_search" as const,
      instructions: `Google: '${contractorName} ${normalizedState} license' or visit '${normalizedState} Secretary of State' website`,
    };
  }

  /**
   * Generate recommended search queries to extract contact info from contractor name
   */
  extractContactFromName(contractorName: string) {
    return {
      method: "requires_google_search" as const,
      search_terms: [
        `${contractorName} phone`,
        `${contractorName} email`,
        `${contractorName} contractor`,
        `${contractorName} construction`,
      ],
      instructions: "Search these terms and extract phone/email from top results",
    };
  }

  /**
   * Enrich an in-memory array of raw permit records with state license lookup metadata
   */
  enrichPermits(rawPermits: RawPermitRecord[]): EnrichedPermitRecord[] {
    return rawPermits.map((row) => {
      const contractorName = (row.contractor_name ?? "").trim();
      const state = (row.state ?? "").trim().toUpperCase();

      if (!contractorName) {
        return {
          ...row,
          contractor_database: "",
          contractor_lookup_url: "",
          lookup_method: "google_search",
          next_step: "Permit record has no contractor name; lookup owner via County Assessor",
        };
      }

      const stateLookup = this.searchStateContractorDatabase(contractorName, state);
      return {
        ...row,
        contractor_database: stateLookup.database,
        contractor_lookup_url: stateLookup.url,
        lookup_method: stateLookup.method,
        next_step: `Google: '${contractorName} ${state} phone' to find contact`,
      };
    });
  }

  /**
   * Process raw permit CSV content and return enriched records + CSV string
   */
  processPermitsCsv(csvContent: string): {
    records: EnrichedPermitRecord[];
    csv: string;
  } {
    const parsed = parseCsvRecords(csvContent);
    const rawPermits: RawPermitRecord[] = parsed.map((row) => ({
      permit_number: row.permit_number ?? "",
      address: row.address ?? "",
      permit_type: row.permit_type ?? "",
      contractor_name: row.contractor_name ?? "",
      issue_date: row.issue_date ?? "",
      state: row.state ?? "",
      estimated_cost: row.estimated_cost ?? "",
      city: row.city ?? "",
      zip_code: row.zip_code ?? "",
    }));

    const records = this.enrichPermits(rawPermits);
    const columns = [
      "permit_number",
      "address",
      "permit_type",
      "contractor_name",
      "issue_date",
      "state",
      "contractor_database",
      "contractor_lookup_url",
      "lookup_method",
      "next_step",
    ];

    return {
      records,
      csv: recordsToCsv(records, columns),
    };
  }

  /**
   * Process raw permit CSV file on disk and write enriched CSV file
   */
  async processPermitsFile(inputFile: string, outputFile: string): Promise<EnrichedPermitRecord[]> {
    const content = await fs.readFile(inputFile, "utf-8");
    const { records, csv } = this.processPermitsCsv(content);
    if (records.length > 0) {
      await fs.writeFile(outputFile, csv, "utf-8");
    }
    return records;
  }

  /**
   * Fetch construction permits from PermitStack API (when `PERMITSTACK_API_KEY` is configured)
   */
  async fetchPermitStackPermits(query: PermitStackQuery): Promise<PermitStackApiPermit[]> {
    if (!this.apiKey) {
      return [];
    }

    const url = new URL(`${this.baseUrl}/permits`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`PermitStack API error ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as { permits?: PermitStackApiPermit[] };
    return data.permits ?? [];
  }

  /**
   * Convert enriched permits into Apsurn's `SourcedCompany` format
   */
  toSourcedCompanies(permits: EnrichedPermitRecord[]): ApsurnSourcedCompany[] {
    return permits
      .filter((p) => p.contractor_name.trim().length > 0)
      .map((p) => ({
        name: p.contractor_name.trim(),
        domain: null,
        description: `${p.permit_type || "Commercial"} permit at ${p.address}`,
        location: [p.city, p.state].filter(Boolean).join(", ") || p.state || null,
        employeeBand: null,
        phone: p.phone ?? null,
        contactName: null,
        contactTitle: "Owner / Principal Contractor",
        source: "PermitStack + State Contractor Registry",
        sourceUrl: p.contractor_lookup_url || null,
        signal: "Active commercial construction permit",
        signalEvidence: `Permit #${p.permit_number} (${p.permit_type}) issued ${p.issue_date}`,
        signalDate: p.issue_date || null,
      }));
  }
}
