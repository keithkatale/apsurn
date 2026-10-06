import type { AiToolDeclaration } from "@/lib/ai/openai";
import { SPECIALIST_ROSTER } from "./registry";
import { resultNeedsLeads } from "./briefing";
import { getAnalyticsSummary, getSequenceOverview, listContacts, listProspectCompanies } from "./shared";
import { getAccountSnapshot } from "./snapshot";
import { delegateToAgent, getAgentStatus } from "./delegate";
import { publishArtifact } from "@/lib/copilot/artifacts";
import { WORKSPACE_MUTATING_TOOLS, WORKSPACE_TOOL_DECLARATIONS, WORKSPACE_TOOL_NAMES, runWorkspaceTool } from "./workspace";
import type { AgentToolContext } from "./types";
import { SPECIALIST_IDS } from "./types";
import { approveAgentTask } from "./plan-approval";
import { CREATE_PLAN_TOOL, createPlan } from "./plan";
import { PLAN_AGENT_IDS } from "./plan-core";

const rosterLines = SPECIALIST_ROSTER.map((agent) => `- ${agent.name} (${agent.id}): ${agent.job}`).join("\n");

export const COPILOT_SYSTEM_INSTRUCTION = `You are Copilot, the AI orchestrator inside apsurn — an AI SDR for founder-led B2B SaaS.

You talk to the signed-in user. You do not run long jobs yourself. You delegate work to named specialists:

${rosterLines}

You may be invoked from Market Insights with a "Context:" block. Treat it as situational awareness, not something to repeat.

How to work:
- Plan, then auto-run. Quick questions and single actions you just do in this turn. Anything bigger — more than ~2 tool rounds, finding more than a handful of leads, chained work (find leads → draft emails → build a sequence), or anything they want on a schedule — goes through create_plan: break it into 1-8 concrete steps, each owned by one agent, with counts and filters spelled out. The user approves once, from the plan card's Approve & run button or by telling you in chat (then call approve_plan), and the plan card shows every step, tool call and result live as it runs. After create_plan, say in one sentence what the plan will do and its estimated credits, then stop. Never say a plan is running unless approve_plan returned queued or the card shows it running; if you have not approved it, say it is waiting for approval.
- For leads with a reason to reach out now (just raised, hiring for a role, complaining about a problem or a competitor, changed their website/tech), plan a signal_scout step and name the trigger and recency in its instruction.
- Reads first, no permission-seeking. If they ask to see leads, contacts, companies, sequences, mentions, or a summary, call a list/snapshot tool in this turn. Never ask "should I look that up?" or "confirm you want me to pull that."
- Use get_account_snapshot for counts and blueprint. Use list_contacts / list_prospect_companies / get_sequence_overview / get_analytics_summary for the actual rows. "Recent leads" means list_contacts ordered as returned — just call it.
- The approved blueprint is the source of truth for industries, geographies, personas, company size, value prop, and positioning. Never ask the user for those. Read the snapshot and use them.
- Specialists talk to you, not the user. If a specialist asks a question you can answer from the snapshot or blueprint, answer them in this turn by calling delegate_to_agent again with those facts and tell them to continue. Do not paste their question to the user.
- Finding leads is never a blind database pull. Read the value prop in the snapshot, decide which buying signals say a company needs what the user sells (hiring for a related role, recent funding or launches, people posting about the problem), and put that reasoning in a create_plan: a signal_scout step with the triggers, keywords drawn from the value prop and a recency window, followed by the steps that use the leads (review the saved leads against the pitch, draft outreach, build a sequence) when the user wants them. Contacts and verified emails are still found through the data providers once a company shows a signal. Use a plain ICP/directory run (start_prospecting_run) only when the user explicitly asks for one. If there are already contacts, list those first, then offer to find more only if they asked for more.
- Operator creates sequences, enrolls, and sends. Writer only drafts an email for a specific contact. Never send "create a sequence" to Writer.
- If they ask to create a sequence for their ICP, delegate Operator immediately and tell it to write the subject and body from the blueprint. Never ask the user for email copy. Contacts are not required to create the sequence. If they say you should have written it, delegate again with that instruction. Do not repeat the specialist's request for copy.
- If a specialist cannot continue because the account has no contacts or companies, do not ask the user and do not start a run yourself. List first if you have not, then propose a lead-finding create_plan as above. If the original ask was a sequence, Operator still creates it in this turn.
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
    name: "approve_plan",
    description:
      "Start the plan waiting for approval in this conversation, when the user says in chat to approve, go ahead, or run it. Only call it after the user clearly agreed. The plan card then shows each step running live. Never say a plan is running unless this returned status queued.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: CREATE_PLAN_TOOL,
    description:
      "Plan multi-step work that runs in the background after the user approves it once. Use for anything needing more than 2 tool rounds, paid lead lookups beyond a handful, chained work (find leads → draft → sequence), or anything the user wants repeated. Each step is done by one agent: researcher (find/save leads), signal_scout (leads with a buying trigger: hiring, funding/news, social pain posts, tech/website changes), listener (market scans), writer (drafts), operator (sequences, enrolling, sends — sends always pause for confirmation). The plan card shows the steps and a credit estimate; after calling this, stop and wait.",
    parameters: {
      type: "object",
      properties: {
        goal: { type: "string", description: "The outcome in one sentence, in the user's terms." },
        steps: {
          type: "array",
          description: "1-8 steps in order. Later steps see earlier steps' results.",
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Short checklist label, e.g. 'Find 20 Series A SaaS companies hiring SDRs'." },
              agent: { type: "string", enum: [...PLAN_AGENT_IDS] },
              instruction: { type: "string", description: "Self-contained instructions for that agent, including counts, filters, and triggers." },
            },
            required: ["title", "agent", "instruction"],
          },
        },
        budget_credits: { type: "number", description: "Optional cap; defaults to the high estimate." },
      },
      required: ["goal", "steps"],
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
      if (!resultNeedsLeads(result) || (typeof args.agent === "string" && args.agent === "researcher") || !result || typeof result !== "object") {
        return result;
      }
      // No blind runs: the account needs leads, so hand the decision back to Copilot to plan signal-based sourcing.
      const summary = typeof (result as { summary?: unknown }).summary === "string" ? (result as { summary: string }).summary : "";
      return {
        ...result,
        needsLeads: true,
        summary: [summary, "The account has no leads to work with yet. Propose a lead-finding plan with create_plan (signal_scout step built from the value prop); do not start a run directly."].filter(Boolean).join("\n\n"),
      };
    }
    case "get_agent_status":
      return getAgentStatus(ctx, args);
    case "approve_plan": {
      if (!ctx.conversationId) return { error: "No plan to approve here." };
      const { data: pending } = await ctx.db
        .from("agent_tasks")
        .select("id")
        .eq("user_id", ctx.userId)
        .eq("conversation_id", ctx.conversationId)
        .eq("status", "awaiting_approval")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!pending) return { error: "There is no plan waiting for approval in this conversation." };
      const approved = await approveAgentTask(ctx.userId, pending.id as string);
      return approved.ok ? { status: "queued", note: "The plan card now shows each step as it runs." } : { error: approved.error };
    }
    case CREATE_PLAN_TOOL:
      return createPlan(ctx, args);
    default:
      if (WORKSPACE_TOOL_NAMES.has(name)) return runWorkspaceTool(ctx, name, args);
      throw new Error(`Unknown Copilot tool: ${name}`);
  }
}

export const COPILOT_MUTATING_TOOLS = new Set([
  ...WORKSPACE_MUTATING_TOOLS,
  CREATE_PLAN_TOOL,
  "approve_plan",
  "delegate_to_agent",
  "source_leads",
  "save_sourced_leads",
  "start_prospecting_run",
  "start_signal_scout",
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
