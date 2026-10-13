/** Where a prospect list came from. Pure, no imports, so it runs on the server, in the browser and under node:test. */
export const LIST_SOURCES = ["ai", "upload", "campaign", "copilot", "market", "manual"] as const;
export type ListSource = (typeof LIST_SOURCES)[number];

export const LIST_SOURCE_LABEL: Record<ListSource, string> = {
  ai: "AI search",
  upload: "Uploaded",
  campaign: "Campaign",
  copilot: "Copilot",
  market: "Market Insights",
  manual: "Created by you",
};

export interface ProspectListInfo {
  id: string;
  name: string;
  source: ListSource;
  created_at: string;
}

/** Lists written before sources were tracked are recognized by the names the app gave them. */
export function listSource(list: { name?: string | null; criteria?: unknown }): ListSource {
  const criteria = list.criteria && typeof list.criteria === "object" ? (list.criteria as Record<string, unknown>) : {};
  const tagged = criteria.source;
  if (typeof tagged === "string" && (LIST_SOURCES as readonly string[]).includes(tagged)) return tagged as ListSource;
  const name = (list.name ?? "").trim();
  if (name === "Market Insights") return "market";
  if (name === "Copilot sourced") return "copilot";
  return "ai";
}
