import type { AiToolDeclaration } from "@/lib/ai/openai";
import { SPECIALIST_ROSTER } from "./registry";
import { resultNeedsLeads } from "./briefing";
import { researcher } from "./researcher";
import { getAnalyticsSummary, getSequenceOverview, listContacts, listProspectCompanies } from "./shared";
import { getAccountSnapshot } from "./snapshot";
import { delegateToAgent, getAgentStatus } from "./delegate";
import type { AgentToolContext } from "./types";
import { SPECIALIST_IDS } from "./types";

const rosterLines = SPECIALIST_ROSTER.map((agent) => `- ${agent.name} (${agent.id}): ${agent.job}`).join("\n");

export const COPILOT_SYSTEM_INSTRUCTION = `You are Copilot, the AI orchestrator inside apsurn — an AI SDR for founder-led B2B SaaS.

You talk to the signed-in user. You do not run long jobs yourself. You delegate work to named specialists:

${rosterLines}

You may be invoked from Market Insights with a "Context:" block. Treat it as situational awareness, not something to repeat.

How to work:
- Reads first, no permission-seeking. If they ask to see leads, contacts, companies, sequences, mentions, or a summary, call a list/snapshot tool in this turn. Never ask "should I look that up?" or "confirm you want me to pull that."
- Use get_account_snapshot for counts and blueprint. Use list_contacts / list_prospect_companies / get_sequence_overview / get_analytics_summary for the actual rows. "Recent leads" means list_contacts ordered as returned — just call it.
- The approved blueprint is the source of truth for industries, geographies, personas, company size, value prop, and positioning. Never ask the user for those. Read the snapshot and use them.
- Specialists talk to you, not the user. If a specialist asks a question you can answer from the snapshot or blueprint, answer them in this turn by calling delegate_to_agent again with those facts and tell them to continue. Do not paste their question to the user.
- When they want new leads and the blueprint is approved, delegate Researcher with: start a prospecting run from the approved blueprint, do not ask clarifying questions. If there are already contacts, list those first, then offer to find more only if they asked for more.
- Operator creates sequences, enrolls, and sends. Writer only drafts an email for a specific contact. Never send "create a sequence" to Writer.
- If they ask to create a sequence for their ICP, delegate Operator immediately and tell it to write the subject and body from the blueprint. Never ask the user for email copy. Contacts are not required to create the sequence. If they say you should have written it, delegate again with that instruction. Do not repeat the specialist's request for copy.
- If a specialist cannot continue because the account has no contacts or companies, do not ask the user. List first if you have not, then have Researcher start a prospecting run. Each saved company costs credits (see creditsPerCompany). If the original ask was a sequence, Operator still creates it in this turn.
- Delegate only when you cannot do the work yourself: Researcher to start a prospecting run, Listener to scan or change keywords, Writer to draft copy, Operator to create sequences, enroll, archive, or send.
- After a Researcher or Listener job is queued, say it is running and mention that each saved company spends credits. Use get_agent_status if they ask how it is going.
- When a tool returns an artifact (a campaign, a lead table, or a run), describe it in one sentence and stop. Do not paste its steps, rows, or JSON. The card in the chat is the result.
- "Source leads from X" means source_leads, not a clarifying question. "Create a sequence" means Operator create_sequence, which renders a campaign card the user can enroll, activate, and run.
- Never invent contact names, emails, IDs, or counts.
- Ask the user only before send, archive, or other irreversible writes, or when the blueprint is missing. Do not ask before reads, lists, drafts, or creating a sequence they requested.
- Writer drafts; Operator sends. Never imply an email was sent unless Operator returned sent or queued.
- If there is no approved blueprint, say so and point them at setup.

Keep replies concise and concrete. After a tool returns, summarize with real names and numbers.`;

export const COPILOT_TOOL_DECLARATIONS: AiToolDeclaration[] = [
  {
    name: "get_account_snapshot",
    description:
      "Full briefing on the user's account: company, blueprint, and counts of prospects, contacts, sequences, enrollments, inboxes, and analytics sites.",
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
    description:
      "List the user's contacts/leads. Use this immediately when they ask for recent, qualified, or all leads — do not ask first.",
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
  {
    name: "get_sequence_overview",
    description: "List sequences or get one sequence's steps and enrollments.",
    parameters: {
      type: "object",
      properties: { sequenceId: { type: "string" } },
    },
  },
  {
    name: "delegate_to_agent",
    description:
      "Hand work you cannot do yourself to Researcher (start a run), Listener (scan/keywords), Writer (draft), or Operator (enroll/send/archive). Do not use this to list leads. Use confirmed=true only for send or archive.",
    parameters: {
      type: "object",
      properties: {
        agent: { type: "string", enum: [...SPECIALIST_IDS] },
        task: { type: "string", description: "What the specialist should do, including names or IDs already resolved." },
        confirmed: { type: "boolean" },
      },
      required: ["agent", "task"],
    },
  },
  {
    name: "get_agent_status",
    description: "Check the latest (or a specific) prospecting run and/or Market Insights last-scan times.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["prospecting", "market", "all"] },
        runId: { type: "string" },
      },
    },
  },
];

export async function runCopilotTool(
  ctx: AgentToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "get_account_snapshot":
      return getAccountSnapshot(ctx.db, ctx.userId);
    case "get_analytics_summary":
      return getAnalyticsSummary(ctx.db, ctx.userId, args as { siteId?: string; range?: string });
    case "list_contacts":
      return listContacts(ctx.db, ctx.userId, args);
    case "list_prospect_companies":
      return listProspectCompanies(ctx.db, ctx.userId, args);
    case "get_sequence_overview":
      return getSequenceOverview(ctx.db, ctx.userId, args as { sequenceId?: string });
    case "delegate_to_agent": {
      const result = await delegateToAgent(ctx, args);
      if (!resultNeedsLeads(result) || (typeof args.agent === "string" && args.agent === "researcher")) {
        return result;
      }
      const callId = `auto-leads-${Date.now()}`;
      ctx.emit?.({
        type: "tool_start",
        id: callId,
        name: "start_prospecting_run",
        agent: "researcher",
        args: {},
      });
      let leadPull: unknown;
      try {
        leadPull = await researcher.runTool(ctx, "start_prospecting_run", {});
      } catch (err) {
        leadPull = { error: err instanceof Error ? err.message : "Could not start a prospecting run" };
      }
      ctx.emit?.({
        type: "tool_end",
        id: callId,
        name: "start_prospecting_run",
        agent: "researcher",
        args: {},
        result: leadPull,
      });
      const pulled = leadPull && typeof leadPull === "object" ? (leadPull as Record<string, unknown>) : {};
      const summary =
        result && typeof result === "object" && typeof (result as { summary?: unknown }).summary === "string"
          ? (result as { summary: string }).summary
          : "";
      const pullNote = pulled.queued
        ? `Pipeline was empty, so Researcher started a prospecting run. Each saved company costs ${pulled.creditsPerCompany ?? 3} credits.`
        : typeof pulled.error === "string"
          ? pulled.error
          : "Could not start a prospecting run.";
      return {
        ...(typeof result === "object" && result ? result : {}),
        needsLeads: true,
        leadPull,
        summary: [summary, pullNote].filter(Boolean).join("\n\n"),
      };
    }
    case "get_agent_status":
      return getAgentStatus(ctx, args);
    default:
      throw new Error(`Unknown Copilot tool: ${name}`);
  }
}

export const COPILOT_MUTATING_TOOLS = new Set([
  "delegate_to_agent",
  "source_leads",
  "save_sourced_leads",
  "start_prospecting_run",
  "cancel_prospecting_run",
  "set_company_status",
  "add_market_keyword",
  "set_keyword_active",
  "follow_account_by_handle",
  "update_market_account_follow",
  "update_market_mention",
  "trigger_market_scan",
  "convert_mention_to_prospect",
  "draft_outreach_email",
  "update_contact_status",
  "archive_contacts",
  "archive_prospect_companies",
  "create_sequence",
  "enroll_contacts",
  "activate_sequence",
  "run_send_pass",
  "send_email_now",
]);
