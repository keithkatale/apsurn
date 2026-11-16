/**
 * Types for the Commercial Real Estate Lead Generation System (Node.js / Next.js).
 * Compatible with Apsurn's `SourcedCompany`, `CandidateCompany`, `CandidateContact`,
 * and `ProspectDataSource` interfaces in `src/lib/prospecting/types.ts`.
 */

export type RealEstateLeadType =
  | "Contractor (Permit)"
  | "Buyer (Land Purchase)"
  | "Dual Match (Contractor + Buyer)";

export type ContactConfidence = "Very High" | "High" | "Medium" | "Low";

export interface RealEstateLead {
  lead_id: number;
  lead_type: RealEstateLeadType;
  name: string;
  title: string;
  company: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  source: string;
  data_freshness: string;
  contact_confidence: ContactConfidence;
  lending_fit: string;
  collateral_signal: string;

  // Contractor-specific fields
  license_number?: string;
  license_status?: string;
  permit_type?: string;
  permit_date?: string;
  permit_value?: string;

  // Buyer-specific fields
  property_address?: string;
  property_city?: string;
  property_type?: string;
  sale_price?: string;
  sale_date?: string;
  llc_status?: string;
  sos_entity_number?: string;

  // Blended-specific fields
  recent_permit?: string;
  recent_land_purchase?: string;
  priority?: "HIGH" | "MEDIUM" | "NORMAL";
}

export interface RawPermitRecord {
  permit_number: string;
  address: string;
  permit_type: string;
  contractor_name: string;
  issue_date: string;
  state: string;
  estimated_cost?: number | string;
  city?: string;
  zip_code?: string;
}

export interface EnrichedPermitRecord extends RawPermitRecord {
  contractor_database: string;
  contractor_lookup_url: string;
  lookup_method: "web_portal" | "google_search" | "api";
  next_step: string;
  phone?: string;
  email?: string;
  license_number?: string;
}

export type BuyerEntityType = "Business Entity (likely LLC/Corp)" | "Individual";

export type ContactResearchStatus =
  | "not_researched"
  | "lookup_in_SOS"
  | "google_search_recommended"
  | "found"
  | "not_found";

export interface CommercialPropertyRecord {
  property_address: string;
  county: string;
  state: string;
  sale_date: string;
  sale_price: string;
  buyer_name: string;
  buyer_type: BuyerEntityType;
  seller_name: string;
  property_type: string;
  zoning: string;
  assessed_value: string;
  contact_status: ContactResearchStatus;
  next_step: string;
}

export interface LeadGenerationOptions {
  contractorCount?: number;
  buyerCount?: number;
  blendedCount?: number;
  states?: string[];
  includeBlendedInMainExport?: boolean;
  filterTopCount?: number;
}

export interface LeadDatabaseSummary {
  total: number;
  contractors: number;
  buyers: number;
  blended: number;
  byState: Record<string, number>;
  byConfidence: {
    veryHigh: number;
    high: number;
    medium: number;
    low: number;
  };
}

/**
 * Mirrors Apsurn's `SourcedCompany` from `src/lib/prospecting/sources/types.ts`
 * so this module drops directly into `/documents/projects/apsurn`.
 */
export interface ApsurnSourcedCompany {
  name: string;
  domain: string | null;
  description: string | null;
  location: string | null;
  employeeBand: string | null;
  phone: string | null;
  contactName: string | null;
  contactTitle: string | null;
  source: string;
  sourceUrl: string | null;
  signal: string | null;
  signalEvidence: string | null;
  signalDate: string | null;
}

/**
 * Mirrors Apsurn's `CandidateCompany` and `CandidateContact` from `src/lib/prospecting/types.ts`.
 */
export interface ApsurnCandidateCompany {
  description?: string | null;
  country?: string | null;
  name: string;
  domain: string;
  websiteUrl: string;
  industry: string | null;
  employeeRange: string | null;
  location: string | null;
  icpFitScore: number;
  dataConfidence: number;
  source: string;
  sourceRef: Record<string, unknown>;
}

export interface ApsurnCandidateContact {
  photoUrl?: string | null;
  country?: string | null;
  fullName: string;
  normalizedName: string;
  title: string | null;
  location: string | null;
  email: string | null;
  emailStatus: "observed" | "verified" | "accept_all" | "risky" | "invalid" | "stale" | "suppressed";
  phone: string | null;
  linkedinUrl: string | null;
  origin: "public" | "inferred" | "customer_confirmed";
  confidence: number;
  evidence: Array<{
    url: string;
    excerpt: string;
    observedAt: string;
    contentHash?: string;
    sourceType?: string;
  }>;
  source: string;
  sourceRef: Record<string, unknown>;
}
