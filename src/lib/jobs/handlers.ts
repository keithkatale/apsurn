import { createAdminClient } from "@/lib/supabase/admin";
import { getEnabledDataSources } from "@/lib/prospecting/registry";
import { saveCanonicalContact } from "@/lib/prospecting/pipeline";
import { claimDueSchedules } from "@/lib/prospecting/scheduling";
import { startProspectingRun } from "@/lib/prospecting/start-run";
import type { CandidateCompany } from "@/lib/prospecting/types";
import { runOutreachSendPass } from "@/lib/outreach/pass";
import { scanAllActiveKeywords, scanAllFollowedAccounts } from "@/lib/market/mutations";

export async function refreshDueProspectIndex() {
  const db = createAdminClient();
  const { data: companies } = await db
    .from("indexed_companies")
    .select("*")
    .lte("refresh_after", new Date().toISOString())
    .order("refresh_after")
    .limit(25);
  const source = getEnabledDataSources()[0];
  let refreshed = 0;
  for (const row of companies ?? []) {
    const candidate: CandidateCompany = {
      name: row.name,
      domain: row.domain,
      websiteUrl: row.website_url,
      industry: row.industry,
      employeeRange: row.employee_range,
      location: row.location,
      icpFitScore: 0,
      dataConfidence: 0.65,
      source: source.id,
      sourceRef: { refresh: true },
    };
    try {
      const contacts = await source.findContacts(candidate, { industries: [], geographies: [], personas: [] }, { limit: 5 });
      for (const contact of contacts) {
        await saveCanonicalContact(row.id, row.domain, contact);
      }
      await db
        .from("indexed_companies")
        .update({
          last_indexed_at: new Date().toISOString(),
          refresh_after: new Date(Date.now() + 90 * 86400_000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      refreshed += 1;
    } catch (error) {
      console.error("[prospecting/refresh] failed", row.domain, error);
    }
  }
  return { refreshed };
}

export async function runDueScheduledProspecting() {
  const db = createAdminClient();
  const due = await claimDueSchedules(db);
  let started = 0;
  for (const schedule of due) {
    const { data: company } = await db.from("companies").select("id,name").eq("id", schedule.company_id).maybeSingle();
    if (!company) continue;

    let criteria = schedule.criteria as {
      industries?: string[];
      companySizeRange?: string;
      geographies?: string[];
      personas?: string[];
    };
    if (!criteria?.industries?.length && !criteria?.geographies?.length) {
      const { data: blueprint } = await db
        .from("company_blueprints")
        .select("icp, personas")
        .eq("company_id", schedule.company_id)
        .maybeSingle();
      const icp = (blueprint?.icp as { industries?: string[]; companySizeRange?: string; geographies?: string[] }) ?? {};
      const personas = (blueprint?.personas as Array<{ title: string }> | undefined) ?? [];
      criteria = {
        industries: icp.industries ?? [],
        companySizeRange: icp.companySizeRange,
        geographies: icp.geographies ?? [],
        personas: personas.map((p) => p.title).filter(Boolean),
      };
    }

    const result = await startProspectingRun(db, {
      userId: schedule.user_id,
      companyId: schedule.company_id,
      listName: `Weekly target — ${new Date().toLocaleDateString()}`,
      limit: schedule.weekly_target,
      criteria: {
        industries: criteria.industries ?? [],
        companySizeRange: criteria.companySizeRange,
        geographies: criteria.geographies ?? [],
        personas: criteria.personas ?? [],
        minimumConfidence: 0.5,
        requiredContactChannels: ["email"],
      },
    });
    if (result.ok) started += 1;
    else console.error("[prospecting-schedule] failed to start run", schedule.id, result.error);
  }
  return { claimed: due.length, started };
}

export async function scanAllCompaniesMarket() {
  const db = createAdminClient();
  const [{ data: keywordCompanyIds }, { data: accountCompanyIds }] = await Promise.all([
    db.from("market_keywords").select("company_id").eq("is_active", true),
    db.from("market_accounts").select("company_id").eq("is_followed", true),
  ]);
  const distinctCompanyIds = [
    ...new Set([...(keywordCompanyIds ?? []), ...(accountCompanyIds ?? [])].map((row) => row.company_id as string)),
  ];

  let totalSaved = 0;
  for (const companyId of distinctCompanyIds) {
    const [{ saved: keywordSaved }, { saved: accountSaved }] = await Promise.all([
      scanAllActiveKeywords(db, companyId),
      scanAllFollowedAccounts(db, companyId),
    ]);
    totalSaved += keywordSaved + accountSaved;
  }
  return { companies: distinctCompanyIds.length, saved: totalSaved };
}

export async function runOutreachCron(userId?: string) {
  return runOutreachSendPass({ userId });
}
