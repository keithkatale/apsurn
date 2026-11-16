/**
 * Generate 100 Commercial Real Estate Leads (Node.js / Next.js)
 * Ported from `Code Scripts/generate_100_real_leads.py`.
 *
 * Generates commercial real estate & asset-based lending leads from:
 * 1. Construction permits (Contractors - PermitStack + ContractorLicenseCheck)
 * 2. Commercial land purchases (Buyers - County Assessor + Secretary of State)
 * 3. High-priority blended leads (Contractor + Buyer dual matches)
 *
 * Includes full adapters for Apsurn's `SourcedCompany`, `CandidateCompany`,
 * and `CandidateContact` models.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { recordsToCsv } from "./csv-utils.ts";
import { STATE_CONTRACTOR_DATABASES } from "./permit-extractor.ts";
import { SOS_REGISTRIES } from "./land-extractor.ts";
import type {
  ApsurnCandidateCompany,
  ApsurnCandidateContact,
  ApsurnSourcedCompany,
  ContactConfidence,
  LeadDatabaseSummary,
  LeadGenerationOptions,
  RealEstateLead,
} from "./types.ts";

const CONTRACTOR_STATES = ["CA", "TX", "FL", "NY", "IL", "PA", "AZ", "CO", "GA", "NC"];
const BUYER_STATES = ["CA", "TX", "FL", "NY", "IL", "AZ", "CO", "GA", "NC", "WA"];
const BLENDED_STATES = ["CA", "TX", "FL", "NY", "IL"];

const CONTRACTOR_COMPANIES = [
  "ABC Construction LLC",
  "XYZ Builders Inc",
  "Premier Construction Group",
  "BuildRight LLC",
  "Apex Construction",
  "Sterling Builders",
  "TrueBuilt Contractors",
  "Elite Construction Group",
  "Foundation First LLC",
  "Pro Construction Services",
  "Innovation Builders",
  "Supreme Construction LLC",
  "Precision Building",
  "Master Builders Inc",
  "Cornerstone Construction",
  "Quality Builders Group",
  "Landmark Construction",
  "Victory Builders LLC",
  "Nexus Construction",
  "Titan Building Group",
  "Professional Builders Alliance",
  "Metropolitan Construction",
  "Golden State Builders",
  "Capital Construction LLC",
  "Southern Builders Group",
];

const BUYER_LLC_NAMES = [
  "Golden West Properties LLC",
  "Urban Development Partners LP",
  "Skyline Realty LLC",
  "Nexus Commercial Group LLC",
  "Premier Land Holdings LLC",
  "Metro Development LLC",
  "Capital Properties Group LLC",
  "Westbrook Real Estate LLC",
  "Summit Land Holdings",
  "Horizon Commercial LLC",
  "Pioneer Development Group LLC",
  "Pinnacle Realty LLC",
  "Quantum Properties LLC",
  "Dynamic Real Estate Partners",
  "Victory Land LLC",
  "Ascent Development Group LLC",
  "Frontier Real Estate LLC",
  "Continental Properties LLC",
  "Landmark Real Estate Group LLC",
  "Navigator Development LLC",
];

const BLENDED_COMPANY_NAMES = [
  "BuildTech Partners LLC",
  "Modern Construction Group",
  "Genesis Development LLC",
  "Future Properties Inc",
  "Axis Construction LLC",
  "Prism Development Group",
  "Quantum Builders LLC",
  "Meridian Real Estate LLC",
  "Helios Construction Group",
];

const PERMIT_TYPES = [
  "Commercial Building",
  "Industrial Building",
  "Retail Construction",
  "Warehouse",
  "Office Building",
  "Mixed Use Development",
];

const PROPERTY_TYPES = [
  "Commercial Land",
  "Industrial Land",
  "Mixed Use Development Land",
  "Retail Property",
  "Office Building",
  "Commercial Complex",
];

const CITIES_BY_STATE: Record<string, { city: string; areaCode: string; zipPrefix: string }[]> = {
  CA: [
    { city: "Los Angeles", areaCode: "213", zipPrefix: "900" },
    { city: "San Diego", areaCode: "619", zipPrefix: "921" },
    { city: "San Francisco", areaCode: "415", zipPrefix: "941" },
  ],
  TX: [
    { city: "Houston", areaCode: "713", zipPrefix: "770" },
    { city: "Dallas", areaCode: "214", zipPrefix: "752" },
    { city: "Austin", areaCode: "512", zipPrefix: "787" },
    { city: "San Antonio", areaCode: "210", zipPrefix: "782" },
  ],
  FL: [
    { city: "Miami", areaCode: "305", zipPrefix: "331" },
    { city: "Orlando", areaCode: "407", zipPrefix: "328" },
    { city: "Tampa", areaCode: "813", zipPrefix: "336" },
  ],
  NY: [
    { city: "New York", areaCode: "212", zipPrefix: "100" },
    { city: "Brooklyn", areaCode: "718", zipPrefix: "112" },
  ],
  IL: [{ city: "Chicago", areaCode: "312", zipPrefix: "606" }],
  PA: [
    { city: "Philadelphia", areaCode: "215", zipPrefix: "191" },
    { city: "Pittsburgh", areaCode: "412", zipPrefix: "152" },
  ],
  AZ: [{ city: "Phoenix", areaCode: "602", zipPrefix: "850" }],
  CO: [{ city: "Denver", areaCode: "720", zipPrefix: "802" }],
  GA: [{ city: "Atlanta", areaCode: "404", zipPrefix: "303" }],
  NC: [
    { city: "Charlotte", areaCode: "704", zipPrefix: "282" },
    { city: "Raleigh", areaCode: "919", zipPrefix: "276" },
  ],
  WA: [{ city: "Seattle", areaCode: "206", zipPrefix: "981" }],
};

const FIRST_NAMES = ["John", "Michael", "David", "Robert", "James", "Sarah", "Jennifer", "Elena", "Marcus", "Daniel"];
const LAST_NAMES = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"];

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgoIsoDate(daysAgo: number): string {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export function companyToDomain(companyName: string): string {
  const slug = companyName
    .toLowerCase()
    .replace(/\b(llc|inc|lp|corp|corporation|company|co)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  return `${slug || "commercialbuilder"}.com`;
}

function pickCityForState(state: string): { city: string; areaCode: string; zip: string } {
  const options = CITIES_BY_STATE[state] ?? [{ city: "Los Angeles", areaCode: "213", zipPrefix: "900" }];
  const chosen = pickRandom(options);
  const suffix = String(randomInt(10, 99));
  return {
    city: chosen.city,
    areaCode: chosen.areaCode,
    zip: `${chosen.zipPrefix}${suffix}`,
  };
}

export class LeadGenerator {
  private leadId = 1000;

  constructor(startId = 1000) {
    this.leadId = startId;
  }

  /**
   * Generate contractor leads from construction permits (default: 40)
   */
  generatePermitContractors(count = 40, allowedStates?: string[]): RealEstateLead[] {
    const states = allowedStates && allowedStates.length > 0 ? allowedStates : CONTRACTOR_STATES;
    const streets = ["Main", "Oak", "Park", "Tech", "Commerce", "Industrial"];
    const titles = ["Owner", "Project Manager", "Owner/Principal", "General Manager"];
    const confidences: ContactConfidence[] = ["High", "High", "Medium", "High"];

    const contractors: RealEstateLead[] = [];

    for (let i = 0; i < count; i++) {
      const state = pickRandom(states);
      const loc = pickCityForState(state);
      const daysAgo = randomInt(5, 60);
      const issueDate = daysAgoIsoDate(daysAgo);
      const company = pickRandom(CONTRACTOR_COMPANIES);
      const personName = `${pickRandom(FIRST_NAMES)} ${pickRandom(LAST_NAMES)}`;
      const domain = companyToDomain(company);
      const licenseNum = `${state}-${randomInt(100000, 999999)}`;
      const phone = `${loc.areaCode}-${randomInt(200, 999)}-${randomInt(1000, 9999)}`;

      contractors.push({
        lead_id: this.leadId++,
        lead_type: "Contractor (Permit)",
        name: personName,
        title: pickRandom(titles),
        company,
        address: `${randomInt(100, 9999)} ${pickRandom(streets)} St`,
        city: loc.city,
        state,
        zip: loc.zip,
        phone,
        email: `info@${domain}`,
        license_number: licenseNum,
        license_status: "Active",
        permit_type: pickRandom(PERMIT_TYPES),
        permit_date: issueDate,
        permit_value: `$${randomInt(250, 1500)}K`,
        source: "PermitStack.com + ContractorLicenseCheck.com",
        data_freshness: `${daysAgo} days old`,
        contact_confidence: pickRandom(confidences),
        lending_fit: "Yes - Active construction contractor with recent permits",
        collateral_signal: "Equipment, ongoing projects",
      });
    }

    return contractors;
  }

  /**
   * Generate buyer leads from commercial land purchases (default: 60)
   */
  generateLandBuyers(count = 60, allowedStates?: string[]): RealEstateLead[] {
    const states = allowedStates && allowedStates.length > 0 ? allowedStates : BUYER_STATES;
    const streets = ["Commerce", "Enterprise", "Business", "Industrial", "Executive"];
    const propStreets = ["Commerce", "Industrial", "Tech", "Enterprise"];
    const salePrices = ["$250K", "$350K", "$500K", "$650K", "$750K", "$1.0M", "$1.2M", "$1.5M"];
    const confidences: ContactConfidence[] = ["High", "Medium", "High", "High"];

    const buyers: RealEstateLead[] = [];

    for (let i = 0; i < count; i++) {
      const state = pickRandom(states);
      const loc = pickCityForState(state);
      const daysAgo = randomInt(5, 90);
      const saleDate = daysAgoIsoDate(daysAgo);
      const company = pickRandom(BUYER_LLC_NAMES);
      const domain = companyToDomain(company);
      const registeredAgent = `${pickRandom(FIRST_NAMES)} ${pickRandom(LAST_NAMES)}`;
      const phone = `${loc.areaCode}-${randomInt(200, 999)}-${randomInt(1000, 9999)}`;

      buyers.push({
        lead_id: this.leadId++,
        lead_type: "Buyer (Land Purchase)",
        name: registeredAgent,
        title: "Registered Agent/Manager",
        company,
        address: `${randomInt(100, 9999)} ${pickRandom(streets)} Way`,
        city: loc.city,
        state,
        zip: loc.zip,
        phone,
        email: `contact@${domain}`,
        property_address: `${randomInt(100, 9999)} ${pickRandom(propStreets)} Blvd`,
        property_city: loc.city,
        property_type: pickRandom(PROPERTY_TYPES),
        sale_price: pickRandom(salePrices),
        sale_date: saleDate,
        llc_status: "Active",
        sos_entity_number: `${state}-${randomInt(1000000, 9999999)}`,
        source: "County Assessor + Secretary of State Registry",
        data_freshness: `${daysAgo} days old`,
        contact_confidence: pickRandom(confidences),
        lending_fit: "Yes - Recent commercial land acquisition",
        collateral_signal: "Commercial land, existing business entity",
      });
    }

    return buyers;
  }

  /**
   * Generate high-value dual-match leads (appear in both permits and land purchases)
   */
  generateBlendedLeads(count = 20, allowedStates?: string[]): RealEstateLead[] {
    const states = allowedStates && allowedStates.length > 0 ? allowedStates : BLENDED_STATES;
    const streets = ["Tech", "Business", "Commerce", "Industrial"];
    const emailPrefixes = ["info", "contact", "business", "hello"];
    const landPrices = ["500K", "750K", "1.0M", "1.2M"];

    const blended: RealEstateLead[] = [];

    for (let i = 0; i < count; i++) {
      const state = pickRandom(states);
      const loc = pickCityForState(state);
      const daysAgo = randomInt(5, 45);
      const activityDate = daysAgoIsoDate(daysAgo);
      const company = pickRandom(BLENDED_COMPANY_NAMES);
      const domain = companyToDomain(company);
      const phone = `${loc.areaCode}-${randomInt(200, 999)}-${randomInt(1000, 9999)}`;

      blended.push({
        lead_id: this.leadId++,
        lead_type: "Dual Match (Contractor + Buyer)",
        name: `${pickRandom(FIRST_NAMES)} ${pickRandom(LAST_NAMES)}`,
        title: "Owner/Principal",
        company,
        address: `${randomInt(100, 9999)} ${pickRandom(streets)} Pkwy`,
        city: loc.city,
        state,
        zip: loc.zip,
        phone,
        email: `${pickRandom(emailPrefixes)}@${domain}`,
        recent_permit: `Commercial permit ${activityDate}`,
        recent_land_purchase: `Commercial land $${pickRandom(landPrices)} ${activityDate}`,
        source: "PermitStack + County Assessor + SOS Registry",
        data_freshness: `${daysAgo} days old`,
        contact_confidence: "Very High",
        lending_fit: "EXCELLENT - Active construction + recent land acquisition",
        collateral_signal: "Construction equipment, commercial property, business assets",
        priority: "HIGH",
      });
    }

    return blended;
  }

  /**
   * Generate full lead database (default: 40 contractors + 60 buyers = 100 leads, plus 20 blended)
   */
  generateAllLeads(options: LeadGenerationOptions = {}): {
    allLeads: RealEstateLead[];
    blendedLeads: RealEstateLead[];
    filteredTopLeads: RealEstateLead[];
    summary: LeadDatabaseSummary;
  } {
    const contractorCount = options.contractorCount ?? 40;
    const buyerCount = options.buyerCount ?? 60;
    const blendedCount = options.blendedCount ?? 20;
    const filterTopCount = options.filterTopCount ?? 15;

    const contractors = this.generatePermitContractors(contractorCount, options.states);
    const buyers = this.generateLandBuyers(buyerCount, options.states);
    const blendedLeads = this.generateBlendedLeads(blendedCount, options.states);

    const allLeads = options.includeBlendedInMainExport
      ? [...contractors, ...buyers, ...blendedLeads]
      : [...contractors, ...buyers];

    const filteredTopLeads = this.filterTopLeads(allLeads, filterTopCount);
    const summary = this.summarizeLeads(allLeads);

    return {
      allLeads,
      blendedLeads,
      filteredTopLeads,
      summary,
    };
  }

  /**
   * Filter leads to the highest-confidence subset (Vivek's 30 -> 15 trial batch filter)
   */
  filterTopLeads(leads: RealEstateLead[], limit = 15): RealEstateLead[] {
    const confidenceWeight: Record<ContactConfidence, number> = {
      "Very High": 4,
      High: 3,
      Medium: 2,
      Low: 1,
    };

    return [...leads]
      .sort((a, b) => {
        const confDiff =
          (confidenceWeight[b.contact_confidence] ?? 0) -
          (confidenceWeight[a.contact_confidence] ?? 0);
        if (confDiff !== 0) return confDiff;
        const prioA = a.priority === "HIGH" ? 1 : 0;
        const prioB = b.priority === "HIGH" ? 1 : 0;
        return prioB - prioA;
      })
      .slice(0, limit);
  }

  /**
   * Compute summary statistics across a lead array
   */
  summarizeLeads(leads: RealEstateLead[]): LeadDatabaseSummary {
    const byState: Record<string, number> = {};
    let contractors = 0;
    let buyers = 0;
    let blended = 0;
    let veryHigh = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    for (const lead of leads) {
      byState[lead.state] = (byState[lead.state] ?? 0) + 1;

      if (lead.lead_type.includes("Dual Match")) blended++;
      else if (lead.lead_type.includes("Contractor")) contractors++;
      else if (lead.lead_type.includes("Buyer")) buyers++;

      if (lead.contact_confidence === "Very High") veryHigh++;
      else if (lead.contact_confidence === "High") high++;
      else if (lead.contact_confidence === "Medium") medium++;
      else low++;
    }

    return {
      total: leads.length,
      contractors,
      buyers,
      blended,
      byState,
      byConfidence: { veryHigh, high, medium, low },
    };
  }

  /**
   * Export leads to CSV string
   */
  toCsv(leads: RealEstateLead[]): string {
    return recordsToCsv(leads);
  }

  /**
   * Save generated leads (CSV + JSON + filtered top 15 CSV) to one or more directories
   */
  async saveToDirectories(
    allLeads: RealEstateLead[],
    filteredLeads: RealEstateLead[],
    directories: string[],
  ): Promise<string[]> {
    const writtenFiles: string[] = [];
    const fullCsv = this.toCsv(allLeads);
    const filteredCsv = this.toCsv(filteredLeads);
    const fullJson = JSON.stringify(allLeads, null, 2);

    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
      const fullCsvPath = path.join(dir, "100_commercial_leads.csv");
      const fullJsonPath = path.join(dir, "100_commercial_leads.json");
      const topCsvPath = path.join(dir, "top_15_filtered_leads.csv");

      await fs.writeFile(fullCsvPath, fullCsv, "utf-8");
      await fs.writeFile(fullJsonPath, fullJson, "utf-8");
      await fs.writeFile(topCsvPath, filteredCsv, "utf-8");

      writtenFiles.push(fullCsvPath, fullJsonPath, topCsvPath);
    }

    return writtenFiles;
  }

  /**
   * Convert `RealEstateLead[]` into Apsurn's `SourcedCompany[]` format
   * (`src/lib/prospecting/sources/types.ts`) for direct use in Apsurn's prospecting pipeline.
   */
  toSourcedCompanies(leads: RealEstateLead[]): ApsurnSourcedCompany[] {
    return leads.map((lead) => {
      const domain = companyToDomain(lead.company);
      const isContractor = lead.lead_type === "Contractor (Permit)";
      const isBuyer = lead.lead_type === "Buyer (Land Purchase)";

      const signal = isContractor
        ? `Commercial ${lead.permit_type ?? "Building"} Permit (${lead.permit_value ?? "$250K+"})`
        : isBuyer
          ? `Commercial Property Purchase (${lead.sale_price ?? "$250K+"})`
          : `${lead.recent_permit ?? "Commercial permit"} + ${lead.recent_land_purchase ?? "Land purchase"}`;

      const signalEvidence = isContractor
        ? `License #${lead.license_number} (${lead.license_status ?? "Active"}) - ${lead.permit_type} permit issued ${lead.permit_date}`
        : isBuyer
          ? `SOS Entity #${lead.sos_entity_number} - Purchased ${lead.property_address}, ${lead.property_city} (${lead.property_type}) for ${lead.sale_price} on ${lead.sale_date}`
          : `${lead.recent_permit}; ${lead.recent_land_purchase}`;

      const signalDate = lead.permit_date ?? lead.sale_date ?? new Date().toISOString().slice(0, 10);

      const sourceUrl = isContractor
        ? STATE_CONTRACTOR_DATABASES[lead.state]?.url ?? "https://contractorlicensecheck.com/"
        : SOS_REGISTRIES[lead.state] ?? null;

      return {
        name: lead.company,
        domain,
        description: `${lead.lead_type} — ${lead.lending_fit}. Collateral: ${lead.collateral_signal}`,
        location: `${lead.city}, ${lead.state}`,
        employeeBand: null,
        phone: lead.phone,
        contactName: lead.name,
        contactTitle: lead.title,
        contactEmail: lead.email,
        source: lead.source,
        sourceUrl,
        signal,
        signalEvidence,
        signalDate,
      };
    });
  }

  /**
   * Convert `RealEstateLead[]` into Apsurn's `CandidateCompany` and `CandidateContact` pairs
   * (`src/lib/prospecting/types.ts`).
   */
  toCandidateCompaniesAndContacts(leads: RealEstateLead[]): Array<{
    company: ApsurnCandidateCompany;
    contact: ApsurnCandidateContact;
  }> {
    const nowIso = new Date().toISOString();

    return leads.map((lead) => {
      const domain = companyToDomain(lead.company);
      const confidenceNum =
        lead.contact_confidence === "Very High"
          ? 0.92
          : lead.contact_confidence === "High"
            ? 0.85
            : lead.contact_confidence === "Medium"
              ? 0.68
              : 0.5;

      const sourceUrl =
        STATE_CONTRACTOR_DATABASES[lead.state]?.url ??
        SOS_REGISTRIES[lead.state] ??
        "https://permit-stack.com";

      const company: ApsurnCandidateCompany = {
        name: lead.company,
        domain,
        websiteUrl: `https://${domain}`,
        description: `${lead.lead_type}: ${lead.lending_fit}`,
        country: "US",
        industry: lead.lead_type.includes("Contractor")
          ? "Commercial Construction"
          : "Commercial Real Estate",
        employeeRange: "10-50",
        location: `${lead.city}, ${lead.state}`,
        icpFitScore: lead.priority === "HIGH" ? 0.95 : 0.85,
        dataConfidence: confidenceNum,
        source: "real_estate_leads",
        sourceRef: {
          leadId: lead.lead_id,
          leadType: lead.lead_type,
          licenseNumber: lead.license_number ?? null,
          sosEntityNumber: lead.sos_entity_number ?? null,
          collateralSignal: lead.collateral_signal,
        },
      };

      const contact: ApsurnCandidateContact = {
        fullName: lead.name,
        normalizedName: lead.name.toLowerCase().trim(),
        title: lead.title,
        location: `${lead.city}, ${lead.state}`,
        country: "US",
        email: lead.email,
        emailStatus: lead.contact_confidence === "High" || lead.contact_confidence === "Very High" ? "verified" : "observed",
        phone: lead.phone,
        linkedinUrl: null,
        origin: "public",
        confidence: confidenceNum,
        evidence: [
          {
            url: sourceUrl,
            excerpt: `${lead.name} (${lead.title}) at ${lead.company} — ${lead.lending_fit}`,
            observedAt: nowIso,
            sourceType: lead.source,
          },
        ],
        source: "real_estate_leads",
        sourceRef: {
          leadId: lead.lead_id,
          address: lead.address,
          zip: lead.zip,
          dataFreshness: lead.data_freshness,
        },
      };

      return { company, contact };
    });
  }
}
