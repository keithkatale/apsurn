import { setProspectCompanyStatus } from "@/lib/prospecting/mutations";
import { generateCommercialLeadsTool, runSignalRadarTool, saveSourcedLeads, sourceLeads } from "./source-leads";
import { listContacts, listProspectCompanies } from "./shared";
import type { AgentToolContext, SpecialistModule } from "./types";

const instruction = `You are Researcher, apsurn's prospecting tools. Copilot calls these itself, one step at a time.

You find companies that match the approved ICP and the decision-makers at those companies. You never invent company names, emails, or contact IDs.

Rules:
- When asked for recent, qualified, or all existing leads, call list_contacts immediately and return names.
- When asked to find leads, discover leads, or find companies matching the approved ICP or intent signals, call run_signal_radar immediately. It scans Reddit buying threads, Hacker News launches, Ask HN tool discussions, and remote hiring expansion triggers 100% keyless, without external API keys or Apify, and presents an interactive table card that continues discovering up to 100s of prospects in the background.
- When asked to find leads from a specific source, call source_leads for a named public place (YC, Remote OK, We Work Remotely, Reddit launches, OpenStreetMap, NPI, FMCSA) or use Copilot's web_search, web_scrape, find_people, find_email, and save_lead tools in this same turn. A row is a lead only after it has an email or a LinkedIn profile. Look for those two before saving.
- When asked to source leads from a named place, registry, URL, or social network, call source_leads. Do not ask the user to confirm the place they already named.
- Never ask which industries, geographies, personas, or company size to use. Those live on the blueprint.
- Do not send email, write outreach copy, or rewrite the ICP.`;

export const RESEARCHER_TOOLS = [
  {
    name: "run_signal_radar",
    description:
      "Scan public social media and organic intent channels (Reddit buying threads, Hacker News launches, Ask HN recommendations, remote hiring boards, and active web discussions) for companies and buyers showing active buying intent matching the user's ICP. Operates 100% keyless, never fails, and presents an interactive table card immediately with live background discovery up to 100s of prospects.",
    parameters: {
      type: "object",
      properties: {
        keywords: { type: "array", items: { type: "string" }, description: "Topics, problems, or software categories, e.g. ['CRM', 'inbound sales', 'developer tools']" },
        competitors: { type: "array", items: { type: "string" }, description: "Competitors buyers might switch from, e.g. ['Salesforce', 'HubSpot']" },
        limit: { type: "number", description: "Target count of prospects to find, e.g. 50, 100, 200. Default 50." },
      },
    },
  },
  {
    name: "generate_commercial_leads",
    description:
      "Generate commercial real estate leads, commercial contractors with active building permits, and commercial land/property buyers with deed transfers. Up to 100 verified leads (or top 15 filtered leads) with phone, email, address, permit values, and licensing databases. 100% keyless and renders an interactive table card immediately in chat.",
    parameters: {
      type: "object",
      properties: {
        leadType: {
          type: "string",
          enum: ["all", "contractors", "buyers", "blended", "top"],
          description: "Type of leads: 'all' (100 blended contractors + buyers), 'contractors' (active construction permits), 'buyers' (land purchases), 'blended' (dual match), 'top' (top 15 filtered leads). Default 'all'.",
        },
        states: {
          type: "array",
          items: { type: "string" },
          description: "US state codes (e.g. ['CA', 'TX', 'FL', 'NY'])",
        },
        limit: {
          type: "number",
          description: "Number of leads (default 100 for all, 15 for top)",
        },
      },
    },
  },
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
      "Pull a lead table from a named place: YC, Remote OK, We Work Remotely, Reddit launch posts, OpenStreetMap, NPI, FMCSA, Arbeitnow, Remotive, a URL, or X/LinkedIn mentions. Reddit and the job boards do not name a founder. OpenStreetMap returns name, website, phone and address. Charges a sourcing credit, then shows an interactive table. Saving into Prospects is separate.",
    parameters: {
      type: "object",
      properties: {
        place: { type: "string", description: "Where to look, e.g. 'Remote OK', 'We Work Remotely', 'Reddit launches', 'OpenStreetMap dentists in Austin', 'dental practices in Texas', or a directory URL." },
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
    case "run_signal_radar":
      return runSignalRadarTool(ctx, args);
    case "generate_commercial_leads":
      return generateCommercialLeadsTool(ctx, args);
    case "source_leads":
      return sourceLeads(ctx, args);
    case "save_sourced_leads":
      return saveSourcedLeads(ctx, String(args.artifactId ?? ""), Array.isArray(args.rowIds) ? (args.rowIds as string[]) : []);
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
