import type { CompanyBlueprint, CompanyIcp, CompanyPersona } from "./types";

function str(v: unknown, maxLen = 500): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed.slice(0, maxLen) : null;
}

function strArray(v: unknown, maxItems = 10, maxLen = 120): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeIcp(raw: unknown): CompanyIcp {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    industries: strArray(o.industries),
    companySizeRange: str(o.companySizeRange, 60) ?? "Unknown",
    geographies: strArray(o.geographies),
    budgetSignals: strArray(o.budgetSignals),
  };
}

function sanitizePersona(raw: unknown): CompanyPersona | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = str(o.title, 100);
  if (!title) return null;
  return {
    title,
    seniority: str(o.seniority, 40) ?? "Unknown",
    painPoints: strArray(o.painPoints, 6, 160),
    goals: strArray(o.goals, 6, 160),
  };
}

function sanitizePersonas(raw: unknown): CompanyPersona[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(sanitizePersona)
    .filter((p): p is CompanyPersona => p !== null)
    .slice(0, 6);
}

/** Never trust raw model JSON — every field is validated/capped here. */
export function sanitizeBlueprint(
  raw: unknown,
  opts: { confidence: "model" | "heuristic_fallback"; modelUsed: string | null }
): CompanyBlueprint {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    companyName: str(o.companyName, 120),
    icp: sanitizeIcp(o.icp),
    personas: sanitizePersonas(o.personas),
    valueProp: str(o.valueProp, 400),
    positioning: str(o.positioning, 400),
    productSummary: str(o.productSummary, 600),
    competitors: strArray(o.competitors, 8, 80),
    confidence: opts.confidence,
    modelUsed: opts.modelUsed,
  };
}
