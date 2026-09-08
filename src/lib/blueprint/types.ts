export interface CompanyIcp {
  industries: string[];
  companySizeRange: string; // e.g. "11-50 employees"
  geographies: string[];
  budgetSignals: string[];
}

export interface CompanyPersona {
  title: string;
  seniority: string; // e.g. "Founder", "VP", "Manager"
  painPoints: string[];
  goals: string[];
}

export interface CompanyBlueprint {
  companyName: string | null;
  icp: CompanyIcp;
  personas: CompanyPersona[];
  valueProp: string | null;
  positioning: string | null;
  productSummary: string | null;
  competitors: string[];
  confidence: "model" | "heuristic_fallback";
  modelUsed: string | null;
}
