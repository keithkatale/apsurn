import { CREDIT_COSTS, SETUP_FREE_LEAD_CAP } from "@/lib/billing/plans";
import { getBillingStatus } from "@/lib/billing/entitlements";
import { setProspectCompanyStatus } from "@/lib/prospecting/mutations";
import { startProspectingRun } from "@/lib/prospecting/start-run";
import type { ProspectCriteria } from "@/lib/prospecting/types";
import { publishArtifact } from "@/lib/copilot/artifacts";
import { saveSourcedLeads, sourceLeads } from "./source-leads";
import { listContacts, listProspectCompanies, stringList } from "./shared";
import type { AgentToolContext, SpecialistModule } from "./types";

const instruction = `You are Researcher, apsurn's prospecting specialist. You talk to Copilot, not the user.

You find companies that match the approved ICP and the decision-makers at those companies. Company search is a deterministic directory job — you start it and report status. You never invent company names, emails, or contact IDs.

You may:
- List prospected companies and contacts
- Start a background prospecting run from the approved blueprint
- Check or cancel an active run
- Qualify or reject companies Copilot named

Rules:
- When asked for recent, qualified, or all existing leads, call list_contacts immediately and return names.
- When asked to find, get, or source leads/companies from the approved ICP, call start_prospecting_run immediately. Omit industries, geographies, and personas — the tool reads the approved blueprint.
- When asked to source leads from a named place, registry, URL, or social network, call source_leads. Do not ask the user to confirm the place they already named.
- Never ask Copilot or the user which industries, geographies, personas, or company size to use. Those live on the blueprint and in the briefing.
- If the tool says there is no approved blueprint or the ICP is empty, report that error and stop. Do not interview anyone.
- Do not send email, write outreach copy, or rewrite the ICP.`;

export const RESEARCHER_TOOLS = [
  {
    name: "list_prospect_companies",
    description: "List prospected companies, optionally filtered by status or a name/domain search query.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search by company name or domain (partial match)" },
        status: { type: "string", enum: ["new", "qualified", "rejected", "contacted"] },
        limit: { type: "number", description: "Max results, default 20, max 100" },
      },
    },
  },
  {
    name: "list_contacts",
    description: "List contacts at prospected companies, optionally filtered by lead status, company, or name/email.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search by contact full name or email (partial match)" },
        leadStatus: { type: "string", enum: ["new", "qualified", "contacted", "replied", "won", "lost"] },
        companyId: { type: "string", description: "Restrict to contacts at this prospect_company id" },
        limit: { type: "number", description: "Max results, default 20, max 100" },
      },
    },
  },
  {
    name: "source_leads",
    description:
      "Pull a lead table from a named place: a registry (YC, NPI, FMCSA, Arbeitnow, Remotive), a URL, or X/Reddit/LinkedIn. Charges a sourcing credit, then shows an interactive table. Saving into Prospects is separate.",
    parameters: {
      type: "object",
      properties: {
        place: { type: "string", description: "Where to look, e.g. 'dental practices in Texas', 'https://example.com/directory', or 'Reddit founders hiring SDRs'." },
        industries: { type: "array", items: { type: "string" } },
        geographies: { type: "array", items: { type: "string" } },
        personas: { type: "array", items: { type: "string" } },
        limit: { type: "number" },
        resolveEmails: { type: "boolean", description: "Look up emails (extra credits per person). Default false." },
      },
      required: ["place"],
    },
  },
  {
    name: "save_sourced_leads",
    description: "Save selected rows from a sourced lead table into the user's Prospects list. Charges credits per company.",
    parameters: {
      type: "object",
      properties: {
        artifactId: { type: "string" },
        rowIds: { type: "array", items: { type: "string" } },
      },
      required: ["artifactId", "rowIds"],
    },
  },
  {
    name: "start_prospecting_run",
    description:
      "Enqueue a background prospecting run. Requires an approved blueprint. Uses supplied criteria, or derives them from the blueprint ICP/personas if omitted.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many companies to find, 1–30, default 10" },
        listName: { type: "string" },
        industries: { type: "array", items: { type: "string" } },
        geographies: { type: "array", items: { type: "string" } },
        personas: { type: "array", items: { type: "string" } },
        companySizeRange: { type: "string" },
      },
    },
  },
  {
    name: "get_prospecting_run",
    description: "Status of a prospecting run. If runId is omitted, returns the user's most recent run.",
    parameters: {
      type: "object",
      properties: {
        runId: { type: "string" },
      },
    },
  },
  {
    name: "cancel_prospecting_run",
    description: "Cancel an active prospecting run by id.",
    parameters: {
      type: "object",
      properties: { runId: { type: "string" } },
      required: ["runId"],
    },
  },
  {
    name: "set_company_status",
    description: "Qualify or reject prospected companies by id (resolved via list_prospect_companies first).",
    parameters: {
      type: "object",
      properties: {
        companyIds: { type: "array", items: { type: "string" }, minItems: 1 },
        status: { type: "string", enum: ["qualified", "rejected"] },
      },
      required: ["companyIds", "status"],
    },
  },
] as const;

function criteriaFromBlueprint(icp: unknown, personas: unknown): ProspectCriteria {
  const icpObj = icp && typeof icp === "object" ? (icp as Record<string, unknown>) : {};
  const personaRows = Array.isArray(personas) ? personas : [];
  return {
    industries: stringList(icpObj.industries, 8),
    geographies: stringList(icpObj.geographies, 8),
    personas: personaRows
      .map((row) => (row && typeof row === "object" ? String((row as { title?: string }).title ?? "").trim() : ""))
      .filter(Boolean)
      .slice(0, 8),
    companySizeRange: typeof icpObj.companySizeRange === "string" ? icpObj.companySizeRange : undefined,
    minimumConfidence: 0.5,
    requiredContactChannels: ["email"],
  };
}

async function startRun(ctx: AgentToolContext, args: Record<string, unknown>) {
  const { db, userId } = ctx;
  const { data: company } = await db
    .from("companies")
    .select("id, company_blueprints!inner(approved_at, icp, personas)")
    .eq("user_id", userId)
    .not("company_blueprints.approved_at", "is", null)
    .maybeSingle();
  if (!company) {
    return { error: "No approved blueprint. The user must build and approve one in setup before Researcher can run." };
  }

  const blueprintRel = company.company_blueprints;
  const blueprint = Array.isArray(blueprintRel) ? blueprintRel[0] : blueprintRel;
  const fromBlueprint = criteriaFromBlueprint(blueprint?.icp, blueprint?.personas);
  const industries = stringList(args.industries, 8).length ? stringList(args.industries, 8) : fromBlueprint.industries;
  const geographies = stringList(args.geographies, 8).length ? stringList(args.geographies, 8) : fromBlueprint.geographies;
  const personas = stringList(args.personas, 8).length ? stringList(args.personas, 8) : (fromBlueprint.personas ?? []);
  const criteria: ProspectCriteria = {
    industries,
    geographies,
    personas,
    companySizeRange: typeof args.companySizeRange === "string" ? args.companySizeRange : fromBlueprint.companySizeRange,
    minimumConfidence: 0.5,
    requiredContactChannels: ["email"],
  };
  if (industries.length === 0 && personas.length === 0) {
    return { error: "The approved blueprint has no industries or personas, so a run cannot start. The user needs to refine the blueprint in setup." };
  }

  const billing = await getBillingStatus(userId);
  const requested = typeof args.limit === "number" ? Math.floor(args.limit) : 10;
  if (!billing.active && requested > SETUP_FREE_LEAD_CAP) {
    return { error: `Start a 7-day trial to find more than ${SETUP_FREE_LEAD_CAP} leads.`, code: "billing_required" };
  }
  const limit = Math.min(30, Math.max(1, billing.active ? requested : Math.min(requested, SETUP_FREE_LEAD_CAP)));
  const listName =
    typeof args.listName === "string" && args.listName.trim()
      ? args.listName.trim().slice(0, 120)
      : `Copilot run — ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;

  const started = await startProspectingRun(db, {
    userId,
    companyId: company.id,
    listName,
    limit,
    criteria,
  });
  if (!started.ok) return { error: started.error };
  const published = {
    queued: true,
    runId: started.runId,
    listId: started.listId,
    limit,
    criteria,
    creditsPerCompany: CREDIT_COSTS.prospect_company,
    creditsNote: `Each company saved costs ${CREDIT_COSTS.prospect_company} credits.`,
  };
  const artifact = await publishArtifact(ctx, {
    kind: "run",
    title: listName,
    payload: { ...published, status: "queued" },
  });
  return { ...published, artifactId: artifact?.id };
}

async function getRun(ctx: AgentToolContext, args: Record<string, unknown>) {
  let query = ctx.db
    .from("prospecting_runs")
    .select("id, list_id, status, stage, target_count, processed_count, contact_count, error_summary, created_at, completed_at, updated_at")
    .eq("user_id", ctx.userId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (typeof args.runId === "string") {
    query = ctx.db
      .from("prospecting_runs")
      .select("id, list_id, status, stage, target_count, processed_count, contact_count, error_summary, created_at, completed_at, updated_at")
      .eq("user_id", ctx.userId)
      .eq("id", args.runId)
      .limit(1);
  }
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { run: null, message: "No prospecting runs yet." };
  return { run: data };
}

async function cancelRun(ctx: AgentToolContext, runId: string) {
  const { data: run } = await ctx.db
    .from("prospecting_runs")
    .update({ status: "cancelled", stage: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("user_id", ctx.userId)
    .in("status", ["queued", "discovering", "enriching", "verifying"])
    .select("list_id")
    .maybeSingle();
  if (!run) return { error: "Active run not found" };
  await ctx.db.from("prospect_lists").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", run.list_id);
  return { status: "cancelled", runId };
}

async function runTool(ctx: AgentToolContext, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "list_prospect_companies":
      return listProspectCompanies(ctx.db, ctx.userId, args);
    case "list_contacts":
      return listContacts(ctx.db, ctx.userId, args);
    case "source_leads":
      return sourceLeads(ctx, args);
    case "save_sourced_leads":
      return saveSourcedLeads(ctx, String(args.artifactId ?? ""), Array.isArray(args.rowIds) ? (args.rowIds as string[]) : []);
    case "start_prospecting_run":
      return startRun(ctx, args);
    case "get_prospecting_run":
      return getRun(ctx, args);
    case "cancel_prospecting_run":
      return cancelRun(ctx, String(args.runId ?? ""));
    case "set_company_status":
      return setProspectCompanyStatus(
        ctx.db,
        ctx.userId,
        args.companyIds as string[],
        args.status as "qualified" | "rejected",
      );
    default:
      throw new Error(`Unknown Researcher tool: ${name}`);
  }
}

export const researcher: SpecialistModule = {
  id: "researcher",
  instruction,
  tools: [...RESEARCHER_TOOLS],
  runTool,
};
