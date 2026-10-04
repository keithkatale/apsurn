import type { AiToolDeclaration } from "@/lib/ai/openai";
import { SPECIALIST_ROSTER } from "./registry";
import { resultNeedsLeads } from "./briefing";
import { researcher } from "./researcher";
import { getAnalyticsSummary, getSequenceOverview, listContacts, listProspectCompanies } from "./shared";
import { getAccountSnapshot } from "./snapshot";
import { delegateToAgent, getAgentStatus } from "./delegate";
import { publishArtifact } from "@/lib/copilot/artifacts";
import { WORKSPACE_MUTATING_TOOLS, WORKSPACE_TOOL_DECLARATIONS, WORKSPACE_TOOL_NAMES, runWorkspaceTool } from "./workspace";
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
- When they want new leads and the blueprint is approved, delegate Researcher with: start a prospecting run from the approved blueprint, do not ask clarifying questions. The run uses the YC leads database first and Icypeas only if those industries or tags are missing there. If there are already contacts, list those first, then offer to find more only if they asked for more.
- Operator creates sequences, enrolls, and sends. Writer only drafts an email for a specific contact. Never send "create a sequence" to Writer.
- If they ask to create a sequence for their ICP, delegate Operator immediately and tell it to write the subject and body from the blueprint. Never ask the user for email copy. Contacts are not required to create the sequence. If they say you should have written it, delegate again with that instruction. Do not repeat the specialist's request for copy.
- If a specialist cannot continue because the account has no contacts or companies, do not ask the user. List first if you have not, then have Researcher start a prospecting run. Each saved company costs credits (see creditsPerCompany). If the original ask was a sequence, Operator still creates it in this turn.
- Delegate only when you cannot do the work yourself: Researcher to start a prospecting run, Listener to scan or change keywords, Writer to draft copy, Operator to create sequences, enroll, archive, or send.
- After a Researcher or Listener job is queued, say it is running and mention that each saved company spends credits. Use get_agent_status if they ask how it is going.
- When a tool returns an artifact (a campaign, a table, a document, or a run), describe it in one sentence and stop. Do not paste its steps, rows, or JSON. The card in the chat is the result.
- Never say you showed, listed, or saved something unless a tool result confirms it (shown/rendered/saved true, or an artifactId). If a list tool returns rows, they are already on screen as a card. If you could not do something, say so and say what you can do instead.
- Marketing craft: before you write or critique any email, sequence, campaign, landing or demo page, brand identity/vision, positioning or messaging, call get_marketing_skill for the matching playbook (cold-email, email-sequences, copywriting, positioning-brand, persuasion, copy-editing) and get_brand_context for the business facts. Ground every claim in the blueprint and brand documents, vary structure and angle between audiences and between emails, and never reuse one template. If key facts are missing (proof points, customer language, differentiators), ask for them or mark them as gaps instead of inventing.
- Make documents and pages detailed, not thin: structured Markdown with headings, tables, quotes and images, and for demos and pages use rich blocks with colored table cells, cards with logos and images, tabs per audience or topic, accordions for detail, dropdowns / toggles / sliders that change what is shown, and metric calculators (for example ROI from seats and price). Only use real facts you have from tools or the user; never invent numbers or customers. Images must be https URLs you were given or know are real; otherwise use cards with logoDomain.
- You can build any visual yourself with render_ui: dashboards, comparisons, plans, checklists, client briefs. Use it whenever the answer is structured or the user asks to "show", "visualize", "compare" or "break down" something. Use only real data from tools. Add "prompt" buttons for sensible next actions.
- The Library holds durable work: brand identity, brand vision, email templates, playbooks, battlecards, notes and client demo pages. Before writing any copy, templates or pages, call get_brand_context so the voice matches. When the user asks you to write one of these, write it with save_document (it appears as a card and in the Library). If brand identity or vision is missing, offer to draft them from the blueprint.
- For a demo or prospecting page for a specific client or prospect: research with the tools you have, build a visual page with save_document (kind demo_page, blocks_json: hero, key points, a tailored plan, proof, a link CTA), then offer to publish it. publish_page makes it public, so only call it with confirmed=true after the user says to share it, then give them the shareUrl.
- get_blueprint reads the full blueprint and update_blueprint edits it. Apply edits the user asks for directly; do not ask for permission to change what they told you to change.
- If a tool returns an error, tell the user what the error actually says in plain words and what to do about it. Never reply with a vague "please try again later".
- To see contacts that are not in any campaign, call list_contacts with campaign="none".
- "Source leads from X" means source_leads, not a clarifying question. "Create a sequence" means Operator create_sequence, which renders a campaign card the user can enroll, activate, and run.
- Never invent contact names, emails, IDs, or counts.
- Ask the user only before send, archive, or other irreversible writes, or when the blueprint is missing. Do not ask before reads, lists, drafts, or creating a sequence they requested.
- Writer drafts; Operator sends. Never imply an email was sent unless Operator returned sent or queued.
- If there is no approved blueprint, say so and point them at setup.

Keep replies concise and concrete. After a tool returns, summarize with real names and numbers.`;

const BASE_TOOL_DECLARATIONS: AiToolDeclaration[] = [
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
        campaign: {
          type: "string",
          enum: ["none", "any"],
          description: '"none" = only contacts not enrolled in any campaign yet; "any" = only contacts already in a campaign.',
        },
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

export const COPILOT_TOOL_DECLARATIONS: AiToolDeclaration[] = [...BASE_TOOL_DECLARATIONS, ...WORKSPACE_TOOL_DECLARATIONS];

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
      ? "These rows are already displayed to the user as a table card. Do not list them again; add one sentence at most."
      : "Could not display the table; summarize the rows briefly in text.",
  };
}

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
    case "list_contacts": {
      const result = await listContacts(ctx.db, ctx.userId, args);
      return withTableCard(
        ctx,
        args.campaign === "none" ? "Contacts not in a campaign" : "Contacts",
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
      if (WORKSPACE_TOOL_NAMES.has(name)) return runWorkspaceTool(ctx, name, args);
      throw new Error(`Unknown Copilot tool: ${name}`);
  }
}

export const COPILOT_MUTATING_TOOLS = new Set([
  ...WORKSPACE_MUTATING_TOOLS,
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
