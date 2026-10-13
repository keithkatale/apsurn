import type { AiToolDeclaration } from "@/lib/ai/openai";
import { getAnalyticsSummary, getSequenceOverview, listContacts, listProspectCompanies } from "./shared";
import { getAccountSnapshot } from "./snapshot";
import { TOOLKIT_MUTATING, TOOLKIT_TOOLS, TOOLKIT_TOOL_NAMES, runToolkitTool } from "./toolkit";
import { allWorkTools, runSpecialistTool, specialistForTool } from "./delegate";
import { publishArtifact } from "@/lib/copilot/artifacts";
import { WORKSPACE_MUTATING_TOOLS, WORKSPACE_TOOL_DECLARATIONS, WORKSPACE_TOOL_NAMES, runWorkspaceTool } from "./workspace";
import type { AgentToolContext } from "./types";

export const COPILOT_SYSTEM_INSTRUCTION = `You are Copilot, the AI orchestrator inside apsurn — an AI SDR for founder-led B2B SaaS.

You talk to the signed-in user and you do all the work yourself, one step after another, with your own tools. There are no other agents to hand work to.

You may be invoked from Market Insights with a "Context:" block. Treat it as situational awareness, not something to repeat.

How to work:
- Do the work yourself, one small step at a time, reading each result before the next call. Nothing runs in the background and nothing is waited for. For a big ask, keep a short checklist in your head and carry on through it without stopping to show it or ask permission. Sends still always ask first.
- Reads first, no permission-seeking. If they ask to see leads, contacts, companies, sequences, mentions, or a summary, call a list/snapshot tool in this turn. Never ask "should I look that up?" or "confirm you want me to pull that."
- Use get_account_snapshot for counts and blueprint. Use list_contacts / list_prospect_companies / get_sequence_overview / get_analytics_summary for the actual rows. "Recent leads" means list_contacts ordered as returned — just call it.
- The approved blueprint is the source of truth for industries, geographies, personas, company size, value prop, and positioning. Never ask the user for those. Read the snapshot and use them.
- Finding leads is research, not a database pull. Read the value prop in the snapshot and decide which buying signals say a company needs what the user sells (just funded, launched, hiring for a related role, posting about the problem). Use plain ICP lists only if the user explicitly asks. If there are already contacts, list those first, then offer to find more only if they asked.
- If they ask to create a sequence for their ICP, call create_sequence immediately and write the subject and body yourself from the blueprint. Never ask the user for email copy. Contacts are not required to create the sequence.
- When you finish, tell the user briefly what you found with real names and numbers, how well it fits the blueprint, what is weak and what to do next. Mention that each saved company spends credits.
- When a tool returns an artifact (a campaign, a table, a document, or a run), describe it in one sentence and stop. Do not paste its steps, rows, or JSON. The card in the chat is the result.
- Never say you showed, listed, or saved something unless a tool result confirms it (shown/rendered/saved true, or an artifactId). If a list tool returns rows, they are already on screen as a card. If you could not do something, say so and say what you can do instead.
- Marketing craft: before you write or critique any email, sequence, campaign, landing or demo page, brand identity/vision, positioning or messaging, call get_marketing_skill for the matching playbook (cold-email, email-sequences, copywriting, positioning-brand, persuasion, copy-editing) and get_brand_context for the business facts. Ground every claim in the blueprint and brand documents, vary structure and angle between audiences and between emails, and never reuse one template. If key facts are missing (proof points, customer language, differentiators), ask for them or mark them as gaps instead of inventing.
- Make documents and pages detailed, not thin: structured Markdown with headings, tables, quotes and images, and for demos and pages use rich blocks with colored table cells, cards with logos and images, tabs per audience or topic, accordions for detail, dropdowns / toggles / sliders that change what is shown, and metric calculators (for example ROI from seats and price). Only use real facts you have from tools or the user; never invent numbers or customers. Images must be https URLs you were given or know are real; otherwise use cards with logoDomain.
- You can build any visual yourself with render_ui: dashboards, comparisons, plans, checklists, client briefs. Use it whenever the answer is structured or the user asks to "show", "visualize", "compare" or "break down" something. Use only real data from tools. Add "prompt" buttons for sensible next actions.
- The Library holds durable work: brand identity, brand vision, email templates, playbooks, battlecards, notes and client demo pages. Before writing any copy, templates or pages, call get_brand_context so the voice matches. When the user asks you to write one of these, write it with save_document (it appears as a card and in the Library). If brand identity or vision is missing, offer to draft them from the blueprint.
- For a demo or prospecting page for a specific client or prospect: research with the tools you have, build a visual page with save_document (kind demo_page, blocks_json: hero, key points, a tailored plan, proof, a link CTA), then offer to publish it. publish_page makes it public, so only call it with confirmed=true after the user says to share it, then give them the shareUrl.
- get_blueprint reads the full blueprint and update_blueprint edits it. Apply edits the user asks for directly; do not ask for permission to change what they told you to change.
- If no leads exist yet and the ask needs them, research some with the toolkit first, then carry on. If a tool returns an error, tell the user what the error actually says in plain words and what to do about it; never pretend a failed tool worked and never invent results.
- To see contacts that are not in any campaign, call list_contacts with campaign="none".
- "Find leads" means start researching with the toolkit, not a clarifying question. "Create a sequence" means create_sequence, which renders a campaign card the user can enroll, activate, and run.
- Never invent contact names, emails, IDs, or counts.
- Ask the user only before send, archive, or other irreversible writes, or when the blueprint is missing. Do not ask before reads, lists, drafts, or creating a sequence they requested.
- If there is no approved blueprint, say so and point them at setup.

Work areas and their rules (you do all of them):
- Toolkit: web_search (real Google results; make a few precise queries, 15-30s each), web_scrape (read one page), find_people (who works at a domain), find_email (finds a confirmed address: it checks the contact database and every common name format at once), verify_email (confirm one address, or up to 10 at once in emails), save_lead (save ONE confirmed lead), present_leads (show a list). To find leads: web_search for the signal (e.g. funding announcements in the last 30 days, launches, job posts) with pastDays; web_scrape promising results to read what the company does and get its real website domain; find_people or the company's own team page for the decision maker; then find their LinkedIn profile: use the link find_people returned, or web_search \"Full Name\" \"Company\" with domains [\"linkedin.com\"] and take the linkedin.com/in/ URL that clearly matches that person (never guess a URL, leave it out if unsure); find_email (it already returns only a verified address, so no extra verify step); only a 'verified' address may be saved with save_lead, with the person's linkedinUrl when you found it, a one-sentence reason from a page you read, and that page's URL. Repeat per company until you reach the number asked or run out of real candidates; say honestly if you saved fewer. Finish with present_leads (listId from save_lead) and one 1-2 sentence outreach angle per company, facts only. Never invent companies, domains, people, emails or funding amounts; if you did not read it, you do not know it. Speed matters: when several lookups do not depend on each other (scraping three results, verifying several emails, finding LinkedIn profiles for several people), call them all in the same step instead of one at a time, and do not re-search for what you already know.
- Writing: for any email you draft for a specific contact, look up the contact first and use draft_outreach_email, which grounds each email in the business and varies structure per recipient. For copy you write yourself, call get_marketing_skill (cold-email) and get_brand_context first. Drafting never sends.
- Sequences and pipeline: look up contacts and sequences by name before changing them; never invent IDs. Before writing sequence copy call get_marketing_skill with "email-sequences" and "cold-email", and get_brand_context. Give every step a different job and angle (problem, proof, insight, objection, breakup), tailor the first email to the persona, and call create_sequence. Archive only what the user asked to archive.
- Sending: run_send_pass and send_email_now need confirmed=true, and you set it only after the user has clearly said to send in this conversation. Otherwise ask first. Never imply an email was sent unless the tool returned sent or queued.

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
];

// Copilot works with a few basic tools it chains itself (toolkit.ts), plus the account reads, the Library/UI tools and
// the writing and sequence actions. The research and market-scan pipelines are not offered: nothing is queued and
// nothing is waited for.
const OWN_TOOL_NAMES = new Set([...BASE_TOOL_DECLARATIONS, ...WORKSPACE_TOOL_DECLARATIONS, ...TOOLKIT_TOOLS].map((tool) => tool.name));
export const COPILOT_TOOL_DECLARATIONS: AiToolDeclaration[] = [
  ...BASE_TOOL_DECLARATIONS,
  ...WORKSPACE_TOOL_DECLARATIONS,
  ...TOOLKIT_TOOLS,
  ...allWorkTools(OWN_TOOL_NAMES, ["writer", "operator"]),
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
    default:
      if (WORKSPACE_TOOL_NAMES.has(name)) return runWorkspaceTool(ctx, name, args);
      if (TOOLKIT_TOOL_NAMES.has(name)) return runToolkitTool(ctx, name, args);
      if (specialistForTool(name)) return runSpecialistTool(ctx, name, args);
      throw new Error(`Unknown Copilot tool: ${name}`);
  }
}

export const COPILOT_MUTATING_TOOLS = new Set([
  ...WORKSPACE_MUTATING_TOOLS,
  ...TOOLKIT_MUTATING,
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
