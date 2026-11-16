import type { AiToolDeclaration } from "@/lib/ai/openai";
import { getAnalyticsSummary, listContacts, listProspectCompanies } from "./shared";
import { getAccountSnapshot } from "./snapshot";
import { TOOLKIT_MUTATING, TOOLKIT_TOOLS, TOOLKIT_TOOL_NAMES, runToolkitTool } from "./toolkit";
import { allWorkTools, runSpecialistTool, specialistForTool } from "./delegate";
import { publishArtifact } from "@/lib/copilot/artifacts";
import { WORKSPACE_MUTATING_TOOLS, WORKSPACE_TOOL_DECLARATIONS, WORKSPACE_TOOL_NAMES, runWorkspaceTool } from "./workspace";
import { generateCommercialLeadsTool, runSignalRadarTool } from "./source-leads";
import type { AgentToolContext } from "./types";

export const COPILOT_SYSTEM_INSTRUCTION = `You are Apsurn Copilot — an autonomous AI SDR engine that helps the user discover, qualify, and prospect high-intent B2B SaaS leads for their business.

Core Rules:
- Never invent company names, people, emails, counts, or URLs. Only use facts from tools or the user.
- For greetings or small talk, reply briefly with no tools.
- When the user asks about their business, ICP, brand, blueprint, or account, call get_account_snapshot and/or get_blueprint / get_brand_context first.
- MANDATORY CRITICAL RULES FOR FINDING LEADS & PROSPECTS:
  1. When the user asks to find leads, source prospects, discover companies matching their ICP, or look for buying intent (e.g. "Find leads that match my approved ICP", "Find 10 leads", "Source prospects"):
     You MUST IMMEDIATELY call "run_signal_radar" with { limit: 100 }.
     DO NOT reply with text saying you scanned or found prospects without calling "run_signal_radar"!
     You HAVE NOT scanned until you call "run_signal_radar". Calling the tool is MANDATORY.
  2. When the user asks for commercial real estate leads, contractors, active building permits, land/property buyers, or to generate leads:
     You MUST call "generate_commercial_leads" (e.g. { leadType: "all", limit: 100 } or { leadType: "top", limit: 15 }).
  3. NEVER use "web_search" for discovering leads or prospecting companies.
  4. NEVER say "I am unable to perform a web search at the moment" — run_signal_radar and generate_commercial_leads are always active, 100% keyless, and never fail.
  5. PRESENTATION IN CHAT (MANDATORY):
     When leads are returned by run_signal_radar, generate_commercial_leads, or source_leads, you MUST ALWAYS output a structured Markdown Table in your reply summarizing the leads found with columns:
     | Company | Domain | Contact / Role | Source / Intent | Signal Reason |
     (or | Company | Location | Contact / Title | Phone / Email | Lead Type / Signal | for commercial leads).
     NEVER say "You can view them in the table above" without also writing out the full Markdown table directly in your text response! Always provide the Markdown table in your message.`;

const BASE_TOOL_DECLARATIONS: AiToolDeclaration[] = [
  {
    name: "run_signal_radar",
    description:
      "Scan public social media and organic intent channels (Reddit buying threads, Hacker News launches, Ask HN recommendations, remote hiring boards, and active web discussions) for companies and buyers showing active buying intent matching the user's ICP. Displays results in an interactive table card immediately, and continues scanning in the background for up to 100s of prospects. Use this tool WHENEVER the user asks to find leads, source prospects, discover companies, or search for buying intent.",
    parameters: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Topics, problems, or software categories, e.g. ['CRM', 'inbound sales', 'developer tools']",
        },
        competitors: {
          type: "array",
          items: { type: "string" },
          description: "Competitors buyers might switch from, e.g. ['Salesforce', 'HubSpot']",
        },
        limit: {
          type: "number",
          description: "Target count of prospects to find, e.g. 50, 100, 200. Default 50.",
        },
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
    name: "get_account_snapshot",
    description: "Full briefing on the user's account: company, blueprint, and counts of prospects and contacts.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_analytics_summary",
    description: "Website analytics summary for a connected site over a time window.",
    parameters: {
      type: "object",
      properties: {
        siteId: { type: "string" },
        range: { type: "string", enum: ["24h", "7d", "30d", "90d"], description: "Defaults to 7d" },
      },
    },
  },
  {
    name: "list_contacts",
    description: "List the user's contacts. Only when they ask to see contacts or leads.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        leadStatus: { type: "string", enum: ["new", "qualified", "contacted", "replied", "won", "lost"] },
        companyId: { type: "string" },
        limit: { type: "number", description: "Default 20, max 100" },
      },
    },
  },
  {
    name: "list_prospect_companies",
    description: "List prospected companies. Use immediately when they ask who is in the pipeline.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        status: { type: "string", enum: ["new", "qualified", "rejected", "contacted"] },
        limit: { type: "number" },
      },
    },
  },
];

const OWN_TOOL_NAMES = new Set([...BASE_TOOL_DECLARATIONS, ...WORKSPACE_TOOL_DECLARATIONS, ...TOOLKIT_TOOLS].map((tool) => tool.name));
export const COPILOT_TOOL_DECLARATIONS: AiToolDeclaration[] = [
  ...BASE_TOOL_DECLARATIONS,
  ...WORKSPACE_TOOL_DECLARATIONS,
  ...TOOLKIT_TOOLS,
  ...allWorkTools(OWN_TOOL_NAMES, ["researcher"]),
];

function cell(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/** Lists must be seen, not just described: render the rows as a card and tell the model so. */
async function withTableCard(
  ctx: AgentToolContext,
  title: string,
  columns: Array<{ key: string; label: string }>,
  rows: Array<Record<string, string>>,
  result: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (rows.length === 0) return { ...result, shown: false, note: "Nothing matched. Say so plainly." };
  const artifact = await publishArtifact(ctx, {
    kind: "ui",
    title,
    payload: {
      blocks: [
        { type: "stats", items: [{ label: "Shown", value: String(rows.length) }] },
        { type: "table", columns, rows },
      ],
    },
  });
  return {
    ...result,
    shown: Boolean(artifact),
    artifactId: artifact?.id,
    note: artifact
      ? "These rows are also rendered in the interactive card above. You MUST ALSO render a structured Markdown table of these rows directly in your chat response text so the user sees the table in the message."
      : "Could not display the table card; render the rows as a full Markdown table in your reply text.",
  };
}

export async function runCopilotTool(
  ctx: AgentToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "run_signal_radar":
      return runSignalRadarTool(ctx, args as { keywords?: string[]; competitors?: string[]; limit?: number });
    case "generate_commercial_leads":
      return generateCommercialLeadsTool(ctx, args as { leadType?: "all" | "contractors" | "buyers" | "blended" | "top"; states?: string[]; limit?: number });
    case "get_account_snapshot":
      return getAccountSnapshot(ctx.db, ctx.userId);
    case "get_analytics_summary":
      return getAnalyticsSummary(ctx.db, ctx.userId, args as { siteId?: string; range?: string });
    case "list_contacts": {
      const result = await listContacts(ctx.db, ctx.userId, args);
      return withTableCard(
        ctx,
        "Contacts",
        [
          { key: "name", label: "Name" },
          { key: "title", label: "Title" },
          { key: "company", label: "Company" },
          { key: "email", label: "Email" },
          { key: "status", label: "Status" },
        ],
        result.contacts.map((c) => ({
          name: cell(c.fullName),
          title: cell(c.title),
          company: cell(c.company?.name),
          email: [cell(c.email), c.email && c.emailStatus ? `(${cell(c.emailStatus)})` : ""].filter(Boolean).join(" "),
          status: cell(c.leadStatus),
        })),
        result,
      );
    }
    case "list_prospect_companies": {
      const result = await listProspectCompanies(ctx.db, ctx.userId, args);
      return withTableCard(
        ctx,
        "Prospect companies",
        [
          { key: "name", label: "Company" },
          { key: "domain", label: "Domain" },
          { key: "industry", label: "Industry" },
          { key: "location", label: "Location" },
          { key: "fit", label: "Fit" },
          { key: "contacts", label: "Contacts" },
        ],
        result.companies.map((c) => ({
          name: cell(c.name),
          domain: cell(c.domain),
          industry: cell(c.industry),
          location: cell(c.location),
          fit: cell(c.icpFitScore),
          contacts: cell(c.contactCount),
        })),
        result,
      );
    }
    default:
      if (WORKSPACE_TOOL_NAMES.has(name)) return runWorkspaceTool(ctx, name, args);
      if (TOOLKIT_TOOL_NAMES.has(name)) return runToolkitTool(ctx, name, args);
      if (specialistForTool(name)) return runSpecialistTool(ctx, name, args);
      throw new Error(`Unknown Copilot tool: ${name}`);
  }
}

export const COPILOT_MUTATING_TOOLS = new Set([
  "run_signal_radar",
  "generate_commercial_leads",
  ...WORKSPACE_MUTATING_TOOLS,
  ...TOOLKIT_MUTATING,
  "source_leads",
  "save_sourced_leads",
  "cancel_prospecting_run",
  "set_company_status",
  "update_contact_status",
  "archive_contacts",
  "archive_prospect_companies",
]);
