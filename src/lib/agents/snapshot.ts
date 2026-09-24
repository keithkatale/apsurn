import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAccountSnapshot(db: SupabaseClient, userId: string) {
  const { data: company } = await db.from("companies").select("*").eq("user_id", userId).maybeSingle();
  if (!company) {
    return { hasCompany: false, message: "No company blueprint yet. The user should build one from setup/onboarding." };
  }

  const { data: blueprint } = await db
    .from("company_blueprints")
    .select("icp, personas, value_prop, positioning, approved_at")
    .eq("company_id", company.id)
    .maybeSingle();

  const [{ count: prospectCount }, { count: sequenceCount }, { count: inboxCount }, { count: siteCount }, { data: contactStatusRows }, { count: activeEnrollments }] =
    await Promise.all([
      db.from("prospect_companies").select("id", { count: "exact", head: true }).eq("company_id", company.id).is("archived_at", null),
      db.from("sequences").select("id", { count: "exact", head: true }).eq("company_id", company.id),
      db.from("connected_inboxes").select("id", { count: "exact", head: true }).eq("user_id", userId),
      db.from("analytics_sites").select("id", { count: "exact", head: true }).eq("user_id", userId),
      db
        .from("contacts")
        .select("lead_status, prospect_companies!inner(company_id)")
        .eq("prospect_companies.company_id", company.id)
        .is("archived_at", null),
      db.from("enrollments").select("id, sequences!inner(company_id)", { count: "exact", head: true }).eq("sequences.company_id", company.id).eq("status", "active"),
    ]);

  const leadStatusBreakdown: Record<string, number> = {};
  for (const row of contactStatusRows ?? []) {
    leadStatusBreakdown[row.lead_status] = (leadStatusBreakdown[row.lead_status] ?? 0) + 1;
  }

  return {
    hasCompany: true,
    company: { name: company.name, websiteUrl: company.website_url, status: company.status },
    blueprint: blueprint
      ? {
          approved: !!blueprint.approved_at,
          icp: blueprint.icp,
          personas: blueprint.personas,
          valueProp: blueprint.value_prop,
          positioning: blueprint.positioning,
        }
      : null,
    counts: {
      prospectCompanies: prospectCount ?? 0,
      contactsByLeadStatus: leadStatusBreakdown,
      totalContacts: Object.values(leadStatusBreakdown).reduce((a, b) => a + b, 0),
      sequences: sequenceCount ?? 0,
      activeEnrollments: activeEnrollments ?? 0,
      connectedInboxes: inboxCount ?? 0,
      analyticsSites: siteCount ?? 0,
    },
  };
}
