/**
 * A stable icon for a Copilot task, picked by keyword from its title + first
 * message — same deterministic, free, instant approach as campaign icons
 * (src/lib/campaigns/icon.ts): no AI call, no drawn SVG, just a Material
 * Symbols ligature chosen from the shared, already-font-loaded set.
 */
import { MATERIAL_ICON_NAMES, type MaterialIconName } from "@/lib/campaigns/icon";

const ICON_SET = new Set<string>(MATERIAL_ICON_NAMES);

const DEFAULT_ICON: MaterialIconName = "forum";

const KEYWORDS: Array<{ icon: MaterialIconName; terms: string[] }> = [
  { icon: "waving_hand", terms: ["hi", "hello", "hey", "yo", "sup", "greetings", "good morning", "good afternoon"] },
  { icon: "bug_report", terms: ["bug", "broken", "error", "not working", "doesn't work", "issue", "fix", "crash"] },
  { icon: "person_search", terms: ["lead", "prospect", "find me", "find companies", "find people", "icp", "buyer", "decision maker"] },
  { icon: "campaign", terms: ["campaign", "sequence", "outreach plan", "cadence"] },
  { icon: "mail", terms: ["email", "draft", "cold email", "inbox", "send a message", "write a message", "subject line"] },
  { icon: "forum", terms: ["reply", "replies", "respond", "conversation", "thread", "chat about"] },
  { icon: "monitoring", terms: ["performance", "stats", "metric", "analytics", "report", "how is", "how are"] },
  { icon: "database", terms: ["csv", "import", "spreadsheet", "upload", "data", "list of"] },
  { icon: "trending_up", terms: ["growth", "scale", "improve", "optimize", "increase"] },
  { icon: "settings", terms: ["setting", "configure", "connect", "integration", "set up", "setup"] },
  { icon: "schedule", terms: ["schedule", "automate", "recurring", "every day", "every week", "cron"] },
  { icon: "lightbulb", terms: ["idea", "suggest", "recommend", "advice", "strategy", "brainstorm"] },
  { icon: "help", terms: ["how do i", "how does", "what is", "explain", "help me understand", "why"] },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary matching, not plain substring search — short terms like
// "hi" or "yo" otherwise match inside unrelated words ("this", "yoga").
function containsTerm(lower: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`).test(lower);
}

function pickTaskIcon(text: string): MaterialIconName {
  const lower = text.toLowerCase();
  let best = DEFAULT_ICON;
  let score = 0;
  for (const row of KEYWORDS) {
    const hits = row.terms.reduce((sum, term) => (containsTerm(lower, term) ? sum + (term.length > 8 ? 2 : 1) : sum), 0);
    if (hits > score) {
      score = hits;
      best = row.icon;
    }
  }
  return best;
}

export function readTaskIcon(stored?: string | null): MaterialIconName | null {
  if (!stored) return null;
  const trimmed = stored.trim();
  const name = trimmed.startsWith("mi:") ? trimmed.slice(3) : trimmed;
  return ICON_SET.has(name) ? (name as MaterialIconName) : null;
}

/** Picked once, from the title + first message, when a task is named. */
export function generateTaskIcon(text: string): string {
  return `mi:${pickTaskIcon(text)}`;
}

/** Stable icon for a task: stored value wins, falls back to re-picking from the given text. */
export function taskMaterialIcon(text: string, stored?: string | null): MaterialIconName {
  return readTaskIcon(stored) ?? pickTaskIcon(text);
}
