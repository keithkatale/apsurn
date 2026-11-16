import type { SpecialistId } from "./types";

export const AGENT_DISPLAY_NAME: Record<SpecialistId, string> = {
  researcher: "Researcher",
};

export const AGENT_TOOL_LABELS: Record<string, string> = {
  get_account_snapshot: "Checking your account",
  web_search: "Searching the web",
  web_scrape: "Reading a page",
  find_people: "Finding people at a company",
  find_email: "Looking up an email",
  verify_email: "Verifying an email",
  save_lead: "Saving a lead",
  present_leads: "Putting the leads together",
  render_ui: "Building a view",
  list_documents: "Looking through documents",
  get_document: "Reading a document",
  save_document: "Saving a document",
  delete_document: "Deleting a document",
  publish_page: "Updating page sharing",
  get_blueprint: "Reading the blueprint",
  update_blueprint: "Updating the blueprint",
  get_brand_context: "Reading your brand",
  get_analytics_summary: "Checking analytics",
  list_prospect_companies: "Looking up companies",
  list_contacts: "Looking up contacts",
  source_leads: "Sourcing leads",
  save_sourced_leads: "Saving leads to Prospects",
  start_prospecting_run: "Starting a prospecting run",
  get_prospecting_run: "Checking prospecting run",
  cancel_prospecting_run: "Cancelling prospecting run",
  set_company_status: "Updating company status",
  update_contact_status: "Updating contact status",
  archive_contacts: "Archiving contacts",
  archive_prospect_companies: "Archiving companies",
};

/** Copilot does all the work itself now, so no tool is attributed to a sub-agent. */
export const TOOL_TO_AGENT: Record<string, SpecialistId> = {};

export function toolLabel(name: string): string {
  return AGENT_TOOL_LABELS[name] ?? name;
}

export function toolAgent(name: string): SpecialistId | undefined {
  return TOOL_TO_AGENT[name];
}

function clip(value: unknown, max: number): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function hostOf(value: unknown): string {
  try {
    return new URL(String(value)).hostname.replace(/^www\./, "");
  } catch {
    return clip(value, 40);
  }
}

/** The live status line while a tool runs: what exactly it is doing. */
export function toolPhase(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "web_search":
      return args.query ? `Searching the web for “${clip(args.query, 60)}”…` : "Searching the web…";
    case "web_scrape":
      return args.url ? `Reading ${hostOf(args.url)}…` : "Reading a page…";
    case "find_people":
      return args.domain ? `Finding people at ${clip(args.domain, 40)}…` : "Finding people…";
    case "find_email":
      return args.fullName ? `Looking up ${clip(args.fullName, 40)}’s email…` : "Looking up an email…";
    case "verify_email":
      return args.email ? `Verifying ${clip(args.email, 50)}…` : "Verifying an email…";
    case "save_lead":
      return args.companyName ? `Saving ${clip(args.companyName, 40)}…` : "Saving a lead…";
    default:
      return `${toolLabel(name)}…`;
  }
}
