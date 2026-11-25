import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Post-sign-in landing: people who already set up their business profile go straight to their leads,
 * everyone else is sent through setup.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL("/login", origin));

    const admin = createAdminClient();
    const { data: company } = await admin
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (company?.id) {
      const { data: blueprint } = await admin
        .from("company_blueprints")
        .select("profile")
        .eq("company_id", company.id)
        .maybeSingle();
      if (blueprint?.profile) return NextResponse.redirect(new URL("/leads", origin));
    }
  } catch (error) {
    console.error("[auth/continue]", error instanceof Error ? error.message : error);
  }
  return NextResponse.redirect(new URL("/setup", origin));
}
