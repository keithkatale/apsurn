export interface PersonaContext {
  title: string;
  seniority: string;
  painPoints: string[];
  goals: string[];
}

export interface BusinessContext {
  companyName: string | null;
  website: string | null;
  productSummary: string | null;
  valueProp: string | null;
  positioning: string | null;
  industries: string[];
  companySizeRange: string | null;
  geographies: string[];
  budgetSignals: string[];
  personas: PersonaContext[];
  competitors: string[];
  brandIdentity: string | null;
  brandVision: string | null;
}


/** The persona whose title best matches the recipient, else null. */
export function matchPersona(ctx: Pick<BusinessContext, "personas">, title: string | null | undefined): PersonaContext | null {
  if (!title || ctx.personas.length === 0) return null;
  const words = new Set(title.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2));
  let best: { persona: PersonaContext; score: number } | null = null;
  for (const persona of ctx.personas) {
    const score = persona.title.toLowerCase().split(/[^a-z]+/).filter((w) => words.has(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { persona, score };
  }
  return best?.persona ?? null;
}

