import type { SupabaseClient } from "@supabase/supabase-js";
import { listDocuments } from "@/lib/workspace/documents";

import type { BusinessContext, PersonaContext } from "./personas";
export { matchPersona } from "./personas";
export type { BusinessContext, PersonaContext } from "./personas";

const EMPTY: BusinessContext = {
  companyName: null,
  website: null,
  productSummary: null,
  valueProp: null,
  positioning: null,
  industries: [],
  companySizeRange: null,
  geographies: [],
  budgetSignals: [],
  personas: [],
  competitors: [],
  brandIdentity: null,
  brandVision: null,
};

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim()) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Everything the AI should know about the sender's business before writing: the approved blueprint
 * plus any brand identity / vision the user keeps in the Library. Missing pieces are simply absent.
 */
export async function loadBusinessContext(db: SupabaseClient, userId: string): Promise<BusinessContext> {
  const { data: company } = await db.from("companies").select("id, name, website_url").eq("user_id", userId).maybeSingle();
  if (!company) return { ...EMPTY };

  const [{ data: bp }, brand] = await Promise.all([
    db
      .from("company_blueprints")
      .select("icp, personas, value_prop, positioning, product_summary, competitors")
      .eq("company_id", company.id)
      .maybeSingle(),
    Promise.all([
      listDocuments(db, userId, { kind: "brand_identity", limit: 1 }),
      listDocuments(db, userId, { kind: "brand_vision", limit: 1 }),
    ]).catch(() => [[], []] as const),
  ]);

  const icp = (bp?.icp ?? {}) as Record<string, unknown>;
  const personas: PersonaContext[] = (Array.isArray(bp?.personas) ? bp.personas : [])
    .map((p: Record<string, unknown>) => ({
      title: text(p?.title) ?? "",
      seniority: text(p?.seniority) ?? "",
      painPoints: strings(p?.painPoints),
      goals: strings(p?.goals),
    }))
    .filter((p: PersonaContext) => p.title);

  return {
    companyName: text(company.name),
    website: text(company.website_url),
    productSummary: text(bp?.product_summary),
    valueProp: text(bp?.value_prop),
    positioning: text(bp?.positioning),
    industries: strings(icp.industries),
    companySizeRange: text(icp.companySizeRange),
    geographies: strings(icp.geographies),
    budgetSignals: strings(icp.budgetSignals),
    personas,
    competitors: strings(bp?.competitors),
    brandIdentity: brand[0][0]?.body.trim().slice(0, 2500) || null,
    brandVision: brand[1][0]?.body.trim().slice(0, 1500) || null,
  };
}

/** Compact, prompt-ready description of the business. */
export function formatBusinessContext(ctx: BusinessContext, focus?: PersonaContext | null): string {
  const lines: string[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value) lines.push(`${label}: ${value}`);
  };
  add("Sender company", [ctx.companyName, ctx.website].filter(Boolean).join(" · ") || null);
  add("What it is", ctx.productSummary);
  add("Value proposition", ctx.valueProp);
  add("Positioning", ctx.positioning);
  add(
    "Ideal customer",
    [ctx.industries.slice(0, 4).join(", "), ctx.companySizeRange, ctx.geographies.slice(0, 3).join(", ")].filter(Boolean).join(" · ") || null,
  );
  add("Buying signals", ctx.budgetSignals.slice(0, 4).join("; ") || null);
  const personas = focus ? [focus, ...ctx.personas.filter((p) => p !== focus)] : ctx.personas;
  if (personas.length) {
    lines.push("Buyer personas (the first is the best match for this recipient):");
    for (const p of personas.slice(0, 3)) {
      lines.push(
        `- ${p.title}${p.seniority ? ` (${p.seniority})` : ""}. Pains: ${p.painPoints.slice(0, 3).join("; ") || "unknown"}. Goals: ${p.goals.slice(0, 3).join("; ") || "unknown"}.`,
      );
    }
  }
  add("Competitors / alternatives", ctx.competitors.slice(0, 5).join(", ") || null);
  if (ctx.brandIdentity) lines.push(`Brand identity and voice (follow this):\n${ctx.brandIdentity}`);
  if (ctx.brandVision) lines.push(`Brand vision:\n${ctx.brandVision}`);
  return lines.join("\n");
}
