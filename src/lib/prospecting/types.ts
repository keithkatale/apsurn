export type TriggerType = "hiring" | "funding_news" | "social_pain" | "tech_website";
export type TriggerEventKind = "funding" | "launch" | "expansion" | "exec_hire";
/** A buying signal to scout for: a company qualifies only if it shows this, recently. */
export interface TriggerSpec {
  type: TriggerType;
  /** Free-text topics: pain phrases for social, product/market words for news. */
  keywords?: string[];
  /** Job-title fragments for hiring, e.g. ["SDR", "account executive"]. */
  roles?: string[];
  /** Competitor names or domains, for tech/website and social triggers. */
  competitors?: string[];
  eventKinds?: TriggerEventKind[];
  /** Only signals at most this many days old count. */
  recencyDays: number;
}
export interface ProspectCriteria { industries: string[]; companySizeRange?: string; geographies: string[]; personas?: string[]; minimumConfidence?: number; requiredContactChannels?: Array<"email" | "phone" | "profile">; preferYcLeads?: boolean; triggers?: TriggerSpec[]; }
export interface ContactEvidence { url: string; excerpt: string; observedAt: string; contentHash?: string; sourceType?: string; }
export type ContactOrigin = "public" | "inferred" | "customer_confirmed";
export type ContactStatus = "observed" | "verified" | "accept_all" | "risky" | "invalid" | "stale" | "suppressed";
export interface ExtractedPerson { fullName: string; normalizedName: string; title: string | null; location: string | null; sourceUrl: string; email: string | null; phone: string | null; profileUrl: string | null; evidence: ContactEvidence; }
export interface CandidateCompany { name: string; domain: string; websiteUrl: string; industry: string | null; employeeRange: string | null; location: string | null; icpFitScore: number; dataConfidence: number; source: string; sourceRef: Record<string, unknown>; }
export interface CandidateContact { fullName: string; normalizedName: string; title: string | null; location: string | null; email: string | null; emailStatus: ContactStatus; phone: string | null; linkedinUrl: string | null; origin: ContactOrigin; confidence: number; evidence: ContactEvidence[]; source: string; sourceRef: Record<string, unknown>; }
export interface ProspectDataSource { id: string; findCompanies(criteria: ProspectCriteria, opts: { limit: number }): Promise<CandidateCompany[]>; findContacts(company: CandidateCompany, criteria: ProspectCriteria, opts: { limit: number }): Promise<CandidateContact[]>; }
export type RunStatus = "queued" | "discovering" | "enriching" | "verifying" | "completed" | "partial" | "failed" | "cancelled";
