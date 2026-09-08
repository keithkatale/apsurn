import { inngest } from "./client";
import { executeProspectingRun } from "@/lib/prospecting/pipeline";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEnabledDataSources } from "@/lib/prospecting/registry";
import { saveCanonicalContact } from "@/lib/prospecting/pipeline";
import type { CandidateCompany } from "@/lib/prospecting/types";

export const runProspecting = inngest.createFunction(
  { id: "run-prospecting", retries: 3, concurrency: { limit: 3 }, triggers: [{ event: "prospecting/run.requested" }], onFailure: async ({ event }) => {
    const original = event.data.event.data as { runId: string; listId: string };
    const message = event.data.error.message || "Prospecting failed";
    const db = createAdminClient();
    await Promise.all([
      db.from("prospecting_runs").update({ status: "failed", stage: "failed", error_summary: message, completed_at: new Date().toISOString() }).eq("id", original.runId),
      db.from("prospect_lists").update({ status: "failed", error: message }).eq("id", original.listId),
    ]);
  } },
  async ({ event, step }) => {
    const { runId, listId } = event.data as { runId: string; listId: string };
    return step.run("prospect", () => executeProspectingRun(runId, listId));
  }
);

export const refreshProspectIndex = inngest.createFunction(
  { id: "refresh-prospect-index", retries: 2, concurrency: { limit: 1 }, triggers: [{ cron: "0 3 * * *" }] },
  async ({ step }) => step.run("refresh-due-companies", async () => {
    const db = createAdminClient();
    const { data: companies } = await db.from("indexed_companies").select("*").lte("refresh_after", new Date().toISOString()).order("refresh_after").limit(25);
    const source = getEnabledDataSources()[0];
    let refreshed = 0;
    for (const row of companies ?? []) {
      const candidate: CandidateCompany = { name: row.name, domain: row.domain, websiteUrl: row.website_url, industry: row.industry, employeeRange: row.employee_range, location: row.location, icpFitScore: 0, dataConfidence: 0.65, source: source.id, sourceRef: { refresh: true } };
      try {
        const contacts = await source.findContacts(candidate, { industries: [], geographies: [], personas: [] }, { limit: 5 });
        for (const contact of contacts) await saveCanonicalContact(row.id, row.domain, contact);
        await db.from("indexed_companies").update({ last_indexed_at: new Date().toISOString(), refresh_after: new Date(Date.now() + 90 * 86400_000).toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id);
        refreshed += 1;
      } catch (error) { console.error("[prospecting/refresh] failed", row.domain, error); }
    }
    return { refreshed };
  })
);
