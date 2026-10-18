import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";

export async function GET() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  const db = createAdminClient();
  const { data: company } = await db
    .from("companies")
    .select("id, name, website_url, status")
    .eq("user_id", userId)
    .maybeSingle();

  const [{ data: blueprint }, { data: inboxes }] = await Promise.all([
    company
      ? db.from("company_blueprints").select("generated_at, approved_at, icp, personas, value_prop, positioning, product_summary, competitors, confidence").eq("company_id", company.id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("connected_inboxes")
      .select("id, provider, email_address, status, scopes, created_at")
      .eq("user_id", userId)
      .eq("status", "connected")
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    email: user?.email ?? null,
    company: company
      ? {
          id: company.id,
          name: company.name,
          websiteUrl: company.website_url,
          status: company.status,
          generatedAt: blueprint?.generated_at ?? null,
          approvedAt: blueprint?.approved_at ?? null,
          blueprint: blueprint
            ? {
                company_id: company.id,
                icp: {
                  industries: blueprint.icp?.industries ?? [],
                  companySizeRange: blueprint.icp?.companySizeRange ?? "",
                  geographies: blueprint.icp?.geographies ?? [],
                  budgetSignals: blueprint.icp?.budgetSignals ?? [],
                },
                personas: blueprint.personas ?? [],
                value_prop: blueprint.value_prop ?? null,
                positioning: blueprint.positioning ?? null,
                product_summary: blueprint.product_summary ?? null,
                competitors: blueprint.competitors ?? [],
                confidence: blueprint.confidence ?? "model",
              }
            : null,
        }
      : null,
    inboxes: inboxes ?? [],
  });
}
