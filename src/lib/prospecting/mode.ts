import type { TriggerSpec } from "./types";

/**
 * ICP search is paused: prospecting starts from things companies did in public (launched a product, joined an
 * accelerator, posted a role) rather than from a database filtered by industry and headcount. Set
 * ICP_SEARCH_PAUSED=0 to bring the old ICP path back.
 */
export function icpSearchPaused(): boolean {
  return process.env.ICP_SEARCH_PAUSED?.trim() !== "0";
}

/** What a run looks for when nobody asked for a specific signal. All sources are free and keyless. */
export const DEFAULT_SIGNAL_TRIGGERS: TriggerSpec[] = [
  { type: "launch", recencyDays: 30 },
  { type: "accelerator", recencyDays: 120 },
  { type: "hiring", recencyDays: 30 },
];
