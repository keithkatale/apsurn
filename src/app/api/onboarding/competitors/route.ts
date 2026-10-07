import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { findCompetitors } from "@/lib/blueprint/competitors";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id,name,website_url").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Analyze your website first" }, { status: 400 });

  const { data: blueprint } = await db
    .from("company_blueprints")
    .select("product_summary,value_prop,positioning,icp,personas")
    .eq("company_id", company.id)
    .maybeSingle();
  if (!blueprint) return NextResponse.json({ error: "No blueprint yet" }, { status: 400 });

  const icp = (blueprint.icp as { industries?: string[] } | null) ?? {};
  const competitors = await findCompetitors({
    companyName: company.name,
    websiteUrl: company.website_url,
    productSummary: blueprint.product_summary,
    positioning: blueprint.positioning,
    valueProp: blueprint.value_prop,
    industries: icp.industries ?? [],
    personas: ((blueprint.personas as Array<{ title?: string }> | null) ?? []).map((p) => p.title ?? "").filter(Boolean),
  });

  await db
    .from("company_blueprints")
    .update({ competitors: competitors.map((c) => c.name), edited_by_user: false })
    .eq("company_id", company.id);

  return NextResponse.json({ competitors: competitors.map((c) => c.name), details: competitors });
}
