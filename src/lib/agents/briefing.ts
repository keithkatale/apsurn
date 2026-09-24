import { getAccountSnapshot } from "./snapshot";
import type { AgentToolContext } from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringList(value: unknown, max = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const row = item as { title?: unknown; name?: unknown };
        return String(row.title ?? row.name ?? "").trim();
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, max);
}

export function formatAccountBriefing(snapshot: Awaited<ReturnType<typeof getAccountSnapshot>>): string {
  if (!("hasCompany" in snapshot) || !snapshot.hasCompany) {
    return "No company or approved blueprint yet. Tell Copilot the user must finish setup.";
  }

  const company = asRecord(snapshot.company);
  const blueprint = asRecord(snapshot.blueprint);
  const icp = asRecord(blueprint.icp);
  const counts = asRecord(snapshot.counts);
  const industries = asStringList(icp.industries);
  const geographies = asStringList(icp.geographies);
  const personas = asStringList(blueprint.personas);
  const valueProp = typeof blueprint.valueProp === "string" ? blueprint.valueProp.trim() : "";
  const positioning = typeof blueprint.positioning === "string" ? blueprint.positioning.trim() : "";
  const size = typeof icp.companySizeRange === "string" ? icp.companySizeRange : "";

  return [
    `Company: ${String(company.name ?? "Unknown")}${company.websiteUrl ? ` (${company.websiteUrl})` : ""}`,
    `Blueprint approved: ${blueprint.approved === true ? "yes" : "no"}`,
    `Industries: ${industries.join(", ") || "none on blueprint"}`,
    `Geographies: ${geographies.join(", ") || "none on blueprint"}`,
    `Personas: ${personas.join(", ") || "none on blueprint"}`,
    size ? `Company size: ${size}` : null,
    valueProp ? `Value prop: ${valueProp}` : null,
    positioning ? `Positioning: ${positioning}` : null,
    `Existing contacts: ${Number(counts.totalContacts ?? 0)}`,
    `Prospect companies: ${Number(counts.prospectCompanies ?? 0)}`,
    `Sequences: ${Number(counts.sequences ?? 0)}`,
    "Use these facts. Do not ask the user or Copilot to repeat them.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function loadAccountBriefing(ctx: AgentToolContext): Promise<string> {
  const snapshot = await getAccountSnapshot(ctx.db, ctx.userId);
  return formatAccountBriefing(snapshot);
}

export function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.includes("?")) return true;
  return /\b(what|which|who|where|should I|need to know|tell me|please provide|can you (?:share|confirm|specify))\b/i.test(trimmed);
}

export function wantsNewLeads(task: string): boolean {
  return (
    /\b(find|get|source|search|start|run|more|new|generate|look for|pull in)\b/i.test(task) &&
    /\b(leads?|prospects?|compan(?:y|ies)|contacts?)\b/i.test(task)
  );
}

export function wantsSequenceCreated(task: string): boolean {
  return /\bsequences?\b/i.test(task) && /\b(create|build|make|set up|setup|new|write|draft|icp)\b/i.test(task);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toolListedEmpty(row: unknown): boolean {
  if (!isRecord(row) || !isRecord(row.result)) return false;
  if (row.name === "list_contacts" && Array.isArray(row.result.contacts) && row.result.contacts.length === 0) return true;
  if (row.name === "list_prospect_companies" && Array.isArray(row.result.companies) && row.result.companies.length === 0) {
    return true;
  }
  return false;
}

export function resultNeedsLeads(result: unknown): boolean {
  if (!isRecord(result)) return false;
  if (result.needsLeads === true) return true;
  const tools = Array.isArray(result.tools) ? result.tools : [];
  if (tools.some((row) => isRecord(row) && row.name === "start_prospecting_run")) return false;
  if (tools.some((row) => isRecord(row) && row.name === "create_sequence")) return false;
  const summary = typeof result.summary === "string" ? result.summary : "";
  const emptyList = tools.some(toolListedEmpty);
  const blocked =
    looksLikeQuestion(summary) ||
    /\bno (existing )?contacts?\b|\bunable to proceed\b|\brequires a ['"]?contact\b|\bwithout a specific contact\b/i.test(
      summary,
    );
  return emptyList || blocked;
}
