import { inngest } from "./client";
import { executeAgentProspectingRun } from "@/lib/prospecting/agent/run";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnabledDataSources } from "@/lib/prospecting/registry";
import { saveCanonicalContact } from "@/lib/prospecting/pipeline";
import { claimDueSchedules } from "@/lib/prospecting/scheduling";
import { startProspectingRun } from "@/lib/prospecting/start-run";
import type { CandidateCompany } from "@/lib/prospecting/types";
import { runOutreachSendPass } from "@/lib/outreach/pass";
import { scanAllActiveKeywords, scanAllFollowedAccounts, runDeepMarketScan } from "@/lib/market/mutations";
import type { MarketPlatform } from "@/lib/market/types";

export const runProspecting = inngest.createFunction(
  {
    id: "run-prospecting",
    retries: 3,
    concurrency: { limit: 3 },
    triggers: [{ event: "prospecting/run.requested" }],
    onFailure: async ({ event }) => {
      const original = event.data.event.data as { runId: string; listId: string };
      const message = event.data.error.message || "Prospecting failed";
      const db = createAdminClient();
      await Promise.all([
        db
          .from("prospecting_runs")
          .update({
            status: "failed",
            stage: "failed",
            error_summary: message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", original.runId),
        db
          .from("prospect_lists")
          .update({ status: "failed", error: message })
          .eq("id", original.listId),
      ]);
    },
  },
  async ({ event, step }) => {
    const { runId, listId } = event.data as { runId: string; listId: string };
    return step.run("prospect", () => executeAgentProspectingRun(runId, listId));
  }
);

export const refreshProspectIndex = inngest.createFunction(
  {
    id: "refresh-prospect-index",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) =>
    step.run("refresh-due-companies", async () => {
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
          const contacts = await source.findContacts(
            candidate,
            { industries: [], geographies: [], personas: [] },
            { limit: 5 }
          );
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
    })
);

/** Fires a prospecting run for every due weekly schedule. Find ≠ send. */
export const runScheduledProspecting = inngest.createFunction(
  {
    id: "run-scheduled-prospecting",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step }) =>
    step.run("claim-and-start", async () => {
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
    })
);

/** Constant social listening: scans every company's active keywords for new mentions. */
export const runMarketScan = inngest.createFunction(
  {
    id: "run-market-scan",
    retries: 1,
    concurrency: { limit: 2 },
    triggers: [{ cron: "*/10 * * * *" }],
  },
  async ({ step }) =>
    step.run("scan-active-keywords", async () => {
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
    })
);

/**
 * Fired right after a user-triggered scan finishes so digging for content
 * continues in the background instead of stopping once the first batch is
 * shown — no chat/AI involvement needed, just an additional deep pass.
 */
export const runMarketDeepScan = inngest.createFunction(
  { id: "run-market-deep-scan", retries: 1, concurrency: { limit: 4 }, triggers: [{ event: "market/scan.deepen" }] },
  async ({ event, step }) => {
    const { companyId, platforms } = event.data as { companyId: string; platforms?: MarketPlatform[] };
    return step.run("deep-scan", () => runDeepMarketScan(createAdminClient(), companyId, platforms));
  }
);

/** OpenOutSend-style one pass — cron every 15m + manual event. Find ≠ send. */
export const outreachSendPass = inngest.createFunction(
  {
    id: "outreach-send-pass",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [{ cron: "*/15 * * * *" }, { event: "outreach/send.pass" }],
  },
  async ({ event, step }) => {
    const userId =
      event.name === "outreach/send.pass"
        ? (event.data as { userId?: string } | undefined)?.userId
        : undefined;
    return step.run("send-pass", () => runOutreachSendPass({ userId }));
  }
);
