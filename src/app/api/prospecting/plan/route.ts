import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { getAiClient } from "@/lib/ai/openai";
import { safeAiErrorMessage } from "@/lib/ai/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Proposes a prospecting plan from the company's approved blueprint.
 *
 * Replaces the blank criteria form: the user should not have to work out
 * their own ICP filters by hand when the blueprint already describes who
 * they sell to. The plan comes back editable, so this is a starting point to
 * approve or adjust, never something that runs on its own.
 */

interface PlanResponse {
  rationale: string;
  steps: string[];
  criteria: {
    industries: string[];
    geographies: string[];
    personas: string[];
    companySizeRange: string;
  };
  limit: number;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  const attempt = (value: string) => JSON.parse(value) as Record<string, unknown>;
  try {
    return attempt(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return attempt(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, max);
}

export async function POST() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const db = createAdminClient();
  const { data: company } = await db
    .from("companies")
    .select("id,name,website_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (!company) return NextResponse.json({ error: "Build and approve your company blueprint first" }, { status: 400 });

  const { data: blueprint } = await db
    .from("company_blueprints")
    .select("product_summary,icp,personas,positioning,approved_at")
    .eq("company_id", company.id)
    .maybeSingle();

  if (!blueprint?.approved_at) {
    return NextResponse.json({ error: "Build and approve your company blueprint first" }, { status: 400 });
  }

  const prompt = `You are planning an outbound prospecting run for this company. Decide who to go after, based only on what its blueprint says it sells and to whom.

COMPANY: ${company.name ?? "(unnamed)"}${company.website_url ? ` — ${company.website_url}` : ""}

WHAT THEY SELL:
${blueprint.product_summary ?? "(not described)"}

IDEAL CUSTOMER PROFILE:
${JSON.stringify(blueprint.icp ?? {}, null, 1).slice(0, 2500)}

TARGET PERSONAS:
${JSON.stringify(blueprint.personas ?? {}, null, 1).slice(0, 2000)}

POSITIONING:
${JSON.stringify(blueprint.positioning ?? {}, null, 1).slice(0, 1500)}

Produce a concrete plan for one run. Choose industries specific enough that a public business directory would list them, and job titles that a company website would actually name. Prefer targets that publish staff names and contact details publicly — the run works by scraping public directories and company sites, so businesses that never list a named contact cannot be prospected this way.

Return ONLY a JSON object (no markdown fences, no commentary):
{
  "rationale": string (2-3 sentences: who you are targeting and why it follows from the blueprint),
  "steps": string[] (3-6 short phrases describing what the run will do, in order),
  "criteria": {
    "industries": string[] (2-5 specific industry/vertical terms),
    "geographies": string[] (1-4 regions, countries or cities; use the blueprint's markets),
    "personas": string[] (2-5 job titles of decision makers to look for),
    "companySizeRange": string (e.g. "11-50 employees")
  },
  "limit": number (how many companies to target in one run, 10-25)
}`;

  try {
    const { ai, model } = await getAiClient();
    const response = await ai.responses.create({ model, input: prompt, max_output_tokens: 8192 });

    const parsed = extractJsonObject(response.output_text ?? "");
    if (!parsed) return NextResponse.json({ error: "The AI could not produce a plan. Try again." }, { status: 502 });

    const rawCriteria = (parsed.criteria ?? {}) as Record<string, unknown>;
    const limit = Number(parsed.limit);

    const plan: PlanResponse = {
      rationale: typeof parsed.rationale === "string" ? parsed.rationale.trim().slice(0, 600) : "",
      steps: stringList(parsed.steps, 6),
      criteria: {
        industries: stringList(rawCriteria.industries, 5),
        geographies: stringList(rawCriteria.geographies, 4),
        personas: stringList(rawCriteria.personas, 5),
        companySizeRange:
          typeof rawCriteria.companySizeRange === "string" ? rawCriteria.companySizeRange.trim().slice(0, 80) : "",
      },
      limit: Number.isFinite(limit) ? Math.min(25, Math.max(5, Math.round(limit))) : 15,
    };

    if (plan.criteria.industries.length === 0 && plan.criteria.personas.length === 0) {
      return NextResponse.json({ error: "The AI could not derive a target profile from your blueprint." }, { status: 502 });
    }

    return NextResponse.json({ plan });
  } catch (error) {
    const message = safeAiErrorMessage(error);
    console.error("[prospecting] plan failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
