import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { crawlSite } from "@/lib/scraper/crawl";
import { generateCompanyBlueprint } from "@/lib/blueprint/generate";

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  let userId: string;
  try { userId = await getCurrentUserId(); } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const body = await request.json().catch(() => null);
  const websiteUrl = typeof body?.websiteUrl === "string" ? body.websiteUrl.trim() : "";
  if (!websiteUrl) {
    return NextResponse.json({ error: "websiteUrl is required" }, { status: 400 });
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .upsert(
      { user_id: userId, website_url: websiteUrl, status: "scraping" },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (companyError || !company) {
    return NextResponse.json(
      { error: companyError?.message ?? "Failed to create company" },
      { status: 500 }
    );
  }

  try {
    const snapshot = await crawlSite(websiteUrl);
    await supabase.from("companies").update({ status: "analyzing" }).eq("id", company.id);

    const blueprint = await generateCompanyBlueprint(snapshot);

    const { data: savedBlueprint, error: blueprintError } = await supabase
      .from("company_blueprints")
      .upsert(
        {
          company_id: company.id,
          raw_scrape: { rootUrl: snapshot.rootUrl, fetchedAt: snapshot.fetchedAt, pages: snapshot.pages.map(({ url, title, text, contentHash, sourceType }) => ({ url, title, text, contentHash, sourceType })) },
          icp: blueprint.icp,
          personas: blueprint.personas,
          value_prop: blueprint.valueProp,
          positioning: blueprint.positioning,
          product_summary: blueprint.productSummary,
          competitors: blueprint.competitors,
          confidence: blueprint.confidence,
          model_used: blueprint.modelUsed,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "company_id" }
      )
      .select()
      .single();

    if (blueprintError) throw new Error(blueprintError.message);

    await supabase
      .from("companies")
      .update({ status: "ready", name: blueprint.companyName ?? company.name })
      .eq("id", company.id);

    return NextResponse.json({ company, blueprint: savedBlueprint });
  } catch (err) {
    console.error("[onboarding/blueprint] failed", err);
    await supabase.from("companies").update({ status: "failed" }).eq("id", company.id);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Blueprint generation failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = createAdminClient();
  let userId: string;
  try { userId = await getCurrentUserId(); } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const body = await request.json().catch(() => null);
  const companyId = typeof body?.companyId === "string" ? body.companyId : "";
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }
  const { data: ownedCompany } = await supabase.from("companies").select("id").eq("id", companyId).eq("user_id", userId).maybeSingle();
  if (!ownedCompany) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const editableFields = [
    "icp",
    "personas",
    "value_prop",
    "positioning",
    "product_summary",
    "competitors",
  ] as const;

  const updates: Record<string, unknown> = { edited_by_user: true };
  for (const field of editableFields) {
    if (field in (body ?? {})) updates[field] = body[field];
  }
  if (body?.approve) updates.approved_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("company_blueprints")
    .update(updates)
    .eq("company_id", companyId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ blueprint: data });
}
