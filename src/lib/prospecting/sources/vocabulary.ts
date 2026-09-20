/**
 * Maps the free text an ICP is written in onto the closed vocabularies the
 * sources actually use.
 *
 * This is the fix for the failure that made prospecting return nothing. YC's
 * taxonomy is 9 industries, 59 subindustries and 337 tags, matched exactly —
 * but an ICP (especially one an AI drafted) says things like "Sales
 * Technology SaaS", "Financial Technology Software" or "North America", none
 * of which appear in any of those lists. Matched literally, every one of
 * those scores zero and the caller receives an empty universe with no
 * indication anything went wrong.
 *
 * Verified against the live directory: these three terms returned 0, 0 and 0
 * companies before this mapping, and 250-708 after it.
 *
 * The tables are deliberately small and hand-maintained. The vocabularies
 * they target are closed and change rarely, and a lookup table is free,
 * instant and unit-testable where a model call is none of those things.
 */

/**
 * Geography phrases to `all_locations` tokens.
 *
 * Tokens are matched whole, so a value here must be a complete comma-part of
 * a location string ("San Francisco, CA, USA" → "san francisco" | "ca" |
 * "usa"). Unmapped input passes through as a literal token, which is why
 * plain city names need no entry.
 */
export const GEO_TOKENS: Record<string, string[]> = {
  "north america": ["USA", "Canada", "Mexico"],
  "united states": ["USA"],
  "united states of america": ["USA"],
  us: ["USA"],
  usa: ["USA"],
  america: ["USA"],
  "u.s.": ["USA"],
  canada: ["Canada"],
  uk: ["United Kingdom", "England", "Scotland", "Wales"],
  "united kingdom": ["United Kingdom", "England", "Scotland", "Wales"],
  britain: ["United Kingdom", "England"],
  "great britain": ["United Kingdom", "England"],
  england: ["England", "United Kingdom"],
  europe: ["United Kingdom", "Germany", "France", "Spain", "Netherlands", "Sweden", "Ireland", "Switzerland", "Poland", "Portugal"],
  "western europe": ["United Kingdom", "Germany", "France", "Spain", "Netherlands", "Ireland", "Switzerland"],
  eu: ["Germany", "France", "Spain", "Netherlands", "Sweden", "Ireland", "Poland", "Portugal"],
  dach: ["Germany", "Austria", "Switzerland"],
  germany: ["Germany"],
  apac: ["Singapore", "Australia", "India", "Japan"],
  "asia pacific": ["Singapore", "Australia", "India", "Japan"],
  india: ["India"],
  australia: ["Australia"],
  latam: ["Brazil", "Mexico", "Argentina", "Colombia", "Chile"],
  "latin america": ["Brazil", "Mexico", "Argentina", "Colombia", "Chile"],
  remote: ["Remote"],
  anywhere: ["Remote"],
  global: [],
  worldwide: [],
};

export interface YcPredicates {
  industries: string[];
  subindustries: string[];
  tags: string[];
}

/**
 * ICP wording to YC predicates.
 *
 * Tags come first in usefulness: that is where an ICP's own words live
 * (SaaS 1101 companies, Artificial Intelligence 1021, Fintech 709,
 * Developer Tools 553). Subindustry is the middle grain, industry the
 * coarsest fallback.
 */
export const YC_TERM_SYNONYMS: Record<string, Partial<YcPredicates>> = {
  // Motion / model
  saas: { tags: ["SaaS"] },
  b2b: { industries: ["B2B"] },
  "b2b saas": { tags: ["SaaS"], industries: ["B2B"] },
  enterprise: { industries: ["B2B"], tags: ["Enterprise"] },
  software: { tags: ["SaaS"], industries: ["B2B"] },
  platform: { tags: ["SaaS"] },
  api: { tags: ["API"] },
  marketplace: { tags: ["Marketplace"] },

  // AI
  ai: { tags: ["Artificial Intelligence"] },
  "artificial intelligence": { tags: ["Artificial Intelligence"] },
  "machine learning": { tags: ["Machine Learning", "Artificial Intelligence"] },
  ml: { tags: ["Machine Learning"] },
  llm: { tags: ["Generative AI", "Artificial Intelligence"] },
  "generative ai": { tags: ["Generative AI", "Artificial Intelligence"] },

  // Go-to-market functions
  sales: { tags: ["Sales"], subindustries: ["B2B -> Sales"] },
  crm: { tags: ["CRM", "Sales"], subindustries: ["B2B -> Sales"] },
  "sales enablement": { tags: ["Sales"], subindustries: ["B2B -> Sales"] },
  "revenue operations": { tags: ["Sales"], subindustries: ["B2B -> Sales"] },
  revops: { tags: ["Sales"], subindustries: ["B2B -> Sales"] },
  outbound: { tags: ["Sales"], subindustries: ["B2B -> Sales"] },
  marketing: { tags: ["Marketing"], subindustries: ["B2B -> Marketing"] },
  martech: { tags: ["Marketing"], subindustries: ["B2B -> Marketing"] },
  advertising: { tags: ["Advertising"], subindustries: ["B2B -> Marketing"] },

  // Other B2B functions
  hr: { tags: ["HR Tech", "Recruiting"], subindustries: ["B2B -> Human Resources"] },
  "human resources": { tags: ["HR Tech"], subindustries: ["B2B -> Human Resources"] },
  recruiting: { tags: ["Recruiting", "HR Tech"], subindustries: ["B2B -> Human Resources"] },
  hiring: { tags: ["Recruiting", "HR Tech"], subindustries: ["B2B -> Human Resources"] },
  productivity: { subindustries: ["B2B -> Productivity"], tags: ["Productivity"] },
  operations: { subindustries: ["B2B -> Operations"] },
  ops: { subindustries: ["B2B -> Operations"] },
  finance: { subindustries: ["B2B -> Finance and Accounting"], tags: ["Fintech"] },
  accounting: { subindustries: ["B2B -> Finance and Accounting"] },
  legal: { tags: ["Legal"], subindustries: ["B2B -> Legal"] },
  security: { tags: ["Security", "Cybersecurity"], subindustries: ["B2B -> Security"] },
  cybersecurity: { tags: ["Cybersecurity", "Security"], subindustries: ["B2B -> Security"] },
  infrastructure: { subindustries: ["B2B -> Infrastructure"], tags: ["Infrastructure"] },
  devtools: { tags: ["Developer Tools"], subindustries: ["B2B -> Engineering, Product and Design"] },
  "developer tools": { tags: ["Developer Tools"], subindustries: ["B2B -> Engineering, Product and Design"] },
  engineering: { subindustries: ["B2B -> Engineering, Product and Design"] },
  data: { tags: ["Data Engineering", "Analytics"], subindustries: ["B2B -> Infrastructure"] },
  analytics: { tags: ["Analytics"] },
  "supply chain": { subindustries: ["B2B -> Supply Chain and Logistics"], tags: ["Supply Chain"] },
  logistics: { subindustries: ["B2B -> Supply Chain and Logistics"], tags: ["Logistics"] },

  // Verticals that map to a YC industry
  fintech: { industries: ["Fintech"], tags: ["Fintech"] },
  "financial technology": { industries: ["Fintech"], tags: ["Fintech"] },
  finserv: { industries: ["Fintech"] },
  banking: { industries: ["Fintech"], tags: ["Banking as a Service"] },
  payments: { industries: ["Fintech"], tags: ["Payments"] },
  insurance: { industries: ["Fintech"], tags: ["Insurance"] },
  healthcare: { industries: ["Healthcare"] },
  health: { industries: ["Healthcare"] },
  healthtech: { industries: ["Healthcare"], tags: ["Digital Health"] },
  medical: { industries: ["Healthcare"] },
  biotech: { industries: ["Healthcare"], tags: ["Biotech"] },
  education: { industries: ["Education"] },
  edtech: { industries: ["Education"] },
  government: { industries: ["Government"] },
  govtech: { industries: ["Government"] },
  "real estate": { industries: ["Real Estate and Construction"] },
  proptech: { industries: ["Real Estate and Construction"] },
  construction: { industries: ["Real Estate and Construction"] },
  manufacturing: { industries: ["Industrials"], subindustries: ["Industrials -> Manufacturing and Robotics"] },
  robotics: { industries: ["Industrials"], tags: ["Robotics"] },
  industrial: { industries: ["Industrials"] },
  climate: { industries: ["Industrials"], tags: ["Climate Tech"] },
  energy: { industries: ["Industrials"], tags: ["Energy"] },
  consumer: { industries: ["Consumer"] },
  ecommerce: { tags: ["E-commerce"] },
  "e-commerce": { tags: ["E-commerce"] },
  retail: { tags: ["Retail"] },
};

/**
 * Terms that describe *how* a company sells rather than *what* it does.
 *
 * These map to enormous buckets — "software" alone means B2B ∪ SaaS, some
 * 3,400 companies — so OR'ing them alongside a specific vertical destroys the
 * filter: "Financial Technology Software" would return every B2B company
 * rather than fintech ones. They are only used when nothing specific matched,
 * i.e. when the ICP really is just "B2B software".
 */
const GENERIC_TERMS = new Set([
  "software",
  "platform",
  "saas",
  "b2b",
  "b2b saas",
  "enterprise",
  "api",
  "tech",
]);

/** Words that carry no vertical meaning and would only add noise to a lookup. */
const STOP_WORDS = new Set([
  "technology",
  "tech",
  "solutions",
  "services",
  "systems",
  "tools",
  "companies",
  "company",
  "startups",
  "startup",
  "products",
  "product",
  "based",
  "and",
  "for",
  "the",
  "of",
  "in",
]);

/**
 * Phrase → lookup candidates, longest first.
 *
 * "Sales Technology SaaS" yields the whole phrase, then its bigrams, then its
 * individual words — so "sales" and "saas" both hit the table even though the
 * full phrase never will.
 */
export function candidateTerms(phrase: string): string[] {
  const normalized = phrase.toLowerCase().trim();
  if (!normalized) return [];

  const rawWords = normalized.split(/[^a-z0-9+.]+/).filter(Boolean);
  const keyWords = rawWords.filter((word) => !STOP_WORDS.has(word));
  const candidates: string[] = [normalized];

  // N-grams are taken over the raw words as well as the filtered ones. Some
  // table entries legitimately contain a filler word — "financial technology"
  // is the canonical example — and filtering first would destroy the very
  // bigram that matches.
  for (const words of [rawWords, keyWords]) {
    for (let size = Math.min(3, words.length); size >= 1; size--) {
      for (let i = 0; i + size <= words.length; i++) {
        const term = words.slice(i, i + size).join(" ");
        // A lone filler word carries no vertical meaning on its own.
        if (size === 1 && STOP_WORDS.has(term)) continue;
        candidates.push(term);
      }
    }
  }
  return [...new Set(candidates)];
}

/**
 * Turns ICP industry/keyword wording into YC predicates.
 *
 * Terms that map to nothing are returned as `keywords`, to be matched against
 * the company's pitch copy — a weaker filter, but better than dropping the
 * user's intent silently.
 */
export function translateYcTerms(
  industries: string[],
  keywords: string[] = []
): YcPredicates & { keywords: string[] } {
  // Specific and generic matches are gathered separately so a vertical term
  // is never diluted by a motion term sitting in the same phrase.
  const specific: YcPredicates = { industries: [], subindustries: [], tags: [] };
  const generic: YcPredicates = { industries: [], subindustries: [], tags: [] };
  const unmatched: string[] = [];

  const add = (target: YcPredicates, predicates: Partial<YcPredicates>) => {
    for (const key of ["industries", "subindustries", "tags"] as const) {
      for (const value of predicates[key] ?? []) {
        if (!target[key].includes(value)) target[key].push(value);
      }
    }
  };

  for (const phrase of [...industries, ...keywords]) {
    let matched = false;
    for (const term of candidateTerms(phrase)) {
      const predicates = YC_TERM_SYNONYMS[term];
      if (!predicates) continue;
      add(GENERIC_TERMS.has(term) ? generic : specific, predicates);
      matched = true;
    }
    if (!matched) {
      const cleaned = phrase.trim();
      if (cleaned) unmatched.push(cleaned);
    }
  }

  const hasSpecific = specific.industries.length + specific.subindustries.length + specific.tags.length > 0;
  const chosen = hasSpecific ? specific : generic;

  return { ...chosen, keywords: unmatched };
}

/** Turns geography wording into `all_locations` tokens, passing unmapped values through literally. */
export function translateGeoTokens(geographies: string[]): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();

  for (const geography of geographies) {
    const normalized = geography.toLowerCase().trim();
    if (!normalized) continue;

    const mapped = GEO_TOKENS[normalized];
    // An empty mapping is meaningful: "global" means "do not filter at all".
    if (mapped) {
      for (const token of mapped) {
        if (!seen.has(token.toLowerCase())) { seen.add(token.toLowerCase()); tokens.push(token); }
      }
      continue;
    }
    // City and country names not in the table are already valid tokens.
    if (!seen.has(normalized)) { seen.add(normalized); tokens.push(geography.trim()); }
  }
  return tokens;
}

/** US state names/abbreviations to the two-letter code the registries expect. */
export const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "washington dc": "DC",
  // Cities common enough in an ICP to be worth resolving to their state.
  "new york city": "NY", nyc: "NY", "san francisco": "CA", "los angeles": "CA", chicago: "IL",
  boston: "MA", austin: "TX", seattle: "WA", denver: "CO", miami: "FL", atlanta: "GA",
};

export function toStateCode(value: string): string | null {
  const normalized = value.toLowerCase().trim();
  if (/^[a-z]{2}$/.test(normalized)) return normalized.toUpperCase();
  return US_STATES[normalized] ?? null;
}

/** CMS provider-taxonomy strings, for routing a healthcare ICP to the right NPI filter. */
export const NPI_TAXONOMIES: Record<string, string> = {
  dental: "Dentist", dentist: "Dentist", dentistry: "Dentist", orthodontic: "Orthodontics",
  "physical therapy": "Physical Therapist", physiotherapy: "Physical Therapist",
  chiropractic: "Chiropractor", chiropractor: "Chiropractor",
  "home health": "Home Health", hospice: "Hospice",
  pharmacy: "Pharmacy", pharmacist: "Pharmacy",
  "behavioral health": "Behavioral Health", "mental health": "Behavioral Health",
  psychology: "Psychologist", psychiatry: "Psychiatry", counseling: "Counselor",
  optometry: "Optometrist", ophthalmology: "Ophthalmology", dermatology: "Dermatology",
  veterinary: "Veterinarian", podiatry: "Podiatrist", nursing: "Nursing",
  "urgent care": "Urgent Care", radiology: "Radiology", cardiology: "Cardiology",
  pediatric: "Pediatrics", "primary care": "Family Medicine", "family medicine": "Family Medicine",
  clinic: "Clinic/Center", laboratory: "Laboratory", "medical practice": "Clinic/Center",
};

/** Persona/title wording to ATS job-title fragments, for the hiring signal. */
export const ROLE_KEYWORDS_BY_PERSONA: Record<string, string[]> = {
  sales: ["sales", "account executive", "sdr", "bdr", "revenue"],
  marketing: ["marketing", "demand generation", "growth"],
  growth: ["growth", "demand generation", "marketing"],
  revenue: ["revenue", "sales", "revops"],
  engineering: ["engineer", "developer", "platform"],
  product: ["product manager", "product owner"],
  finance: ["finance", "controller", "accounting"],
  hr: ["people", "talent", "recruiter", "human resources"],
  operations: ["operations", "ops"],
  customer: ["customer success", "support", "account manager"],
};

/** ATS title fragments implied by the ICP's target personas, with a GTM default. */
export function roleKeywordsFor(personas: string[]): string[] {
  const keywords = new Set<string>();
  for (const persona of personas) {
    for (const term of candidateTerms(persona)) {
      for (const keyword of ROLE_KEYWORDS_BY_PERSONA[term] ?? []) keywords.add(keyword);
    }
  }
  if (keywords.size === 0) {
    // Hiring for go-to-market is the signal that matters by default: it means
    // the company is building the function an SDR product replaces.
    return ["sales", "account executive", "sdr", "bdr", "revenue", "growth", "marketing"];
  }
  return [...keywords];
}
