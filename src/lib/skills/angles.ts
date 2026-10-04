import { matchPersona, type BusinessContext, type PersonaContext } from "./personas.ts";

/** Small stable hash so a given recipient always lands on the same plan, and different ones spread out. */
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(items: readonly T[], n: number, offset = 0): T {
  return items[(n + offset) % items.length];
}

const FRAMEWORKS = [
  {
    id: "observation-problem-proof-ask",
    how: "Open with one specific observation about them or their company. Name the problem that usually comes with it. Give one proof point of a similar result. End with one easy ask.",
  },
  {
    id: "question-value-ask",
    how: "Open with a genuine, specific question about their situation. Say in one sentence what you do about it, with one result. End with a light ask.",
  },
  {
    id: "trigger-insight-ask",
    how: "Open with something that just changed for them. Share the insight about what that tends to cause. Say how you have handled it. End with a light ask.",
  },
  {
    id: "story-bridge-ask",
    how: "Tell a two-sentence story about a similar company: the problem, then what changed. Bridge to why it may apply to them. End with a light ask.",
  },
  {
    id: "contrarian-insight-ask",
    how: "Open with one thing people in their role usually get wrong, backed by a concrete example. Connect it to what you do. End with a light ask.",
  },
  {
    id: "give-first-ask",
    how: "Offer one concrete, useful thing (a short teardown, a list, a benchmark) tied to their situation and ask permission to send it. Do not pitch the product in this email.",
  },
] as const;

const ASKS = [
  "an interest check (\"Worth a look?\")",
  "permission to send something specific (\"Open to me sending the two-minute version?\")",
  "a priority check (\"Is this on your radar this quarter or later?\")",
  "an ownership check (\"Who owns this on your side?\")",
  "a yes/no on relevance (\"Is this a problem you're dealing with, or am I off?\")",
] as const;

const OPENINGS = [
  "start with a fact about their company or role",
  "start with the problem in their words",
  "start with a short, specific question",
  "start with what you noticed and why it caught your eye",
  "start with the outcome similar teams get",
] as const;

const LENGTHS = ["55 to 70 words", "70 to 85 words", "45 to 60 words", "60 to 80 words"] as const;

/** What each follow-up should bring that is new. */
const FOLLOWUP_ANGLES = [
  "a different proof point: a specific result for a similar company (only if real; otherwise a sharper statement of the problem)",
  "a short insight or observation about their space they can use whether or not they reply",
  "the most likely objection, addressed honestly in one or two sentences",
  "a small, useful resource or example offered with permission",
  "a polite breakup: you will stop here, one line on the value, door open",
] as const;

export interface EmailPlan {
  framework: string;
  frameworkHow: string;
  persona: PersonaContext | null;
  angle: string;
  opening: string;
  ask: string;
  length: string;
}

/**
 * Chooses a structure and an angle for one email. The seed (contact + step + regenerate count) makes the
 * choice vary between recipients while staying stable for the same one, so campaigns stop reading identically.
 */
export function planEmail(input: {
  seed: string;
  stepNumber: number;
  business: BusinessContext;
  contactTitle?: string | null;
  hasSignal: boolean;
}): EmailPlan {
  const n = hashSeed(input.seed);
  const { business } = input;
  const persona = matchPersona(business, input.contactTitle) ?? (business.personas.length ? pick(business.personas, n) : null);

  // Candidate angles drawn from the business itself.
  const angles: string[] = [];
  for (const pain of persona?.painPoints ?? []) angles.push(`Lead with this pain for their role: ${pain}`);
  for (const goal of persona?.goals ?? []) angles.push(`Lead with this goal and what blocks it: ${goal}`);
  if (business.valueProp) angles.push(`Lead with the core value: ${business.valueProp}`);
  if (business.positioning) angles.push(`Lead with the positioning: ${business.positioning}`);
  if (business.competitors.length) angles.push(`Lead with why teams move off alternatives like ${business.competitors.slice(0, 3).join(", ")} (never disparage them)`);
  if (business.budgetSignals.length) angles.push(`Lead with a buying signal: ${pick(business.budgetSignals, n)}`);
  if (angles.length === 0) angles.push("Lead with the problem their role typically faces, in plain words");

  const isFollowup = input.stepNumber > 1;
  const framework = pick(FRAMEWORKS, n, input.hasSignal ? 2 : 0);
  return {
    framework: framework.id,
    frameworkHow: framework.how,
    persona,
    angle: isFollowup ? pick(FOLLOWUP_ANGLES, input.stepNumber - 2) : pick(angles, n >>> 3),
    opening: pick(OPENINGS, n >>> 5),
    ask: pick(ASKS, n >>> 7),
    length: pick(LENGTHS, n >>> 9),
  };
}
