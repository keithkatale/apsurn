import type { RadarIntent } from "./types";

/** Conversations under this score never reach the feed. */
export const MIN_QUALIFY_SCORE = 60;

export interface HeuristicVerdict {
  score: number;
  intent: RadarIntent;
  reject: boolean;
  reason: string;
}

const JOB_SEEKER = /\b(open to work|looking for (a )?(job|role|position)|hire me|seeking (employment|a role)|my resume)\b/i;
const VENDOR = /\b(our (platform|product|saas|tool|app)|we (built|launched|offer)|book a demo|sign up for|check out (my|our)|i'm building|dm me)\b/i;
const ASKING = /\b(looking for (a |an )?(tool|software|app|platform)|recommend (a |me )?(a )?(tool|software)|any tool for|best software|suggest a tool|alternative to)\b/i;
const PAIN = /\b(struggling with|how do you handle|pain point|too much manual|can't keep up|tired of|frustrated with|anyone else)\b/i;
const HIRING = /\b(we're hiring|we are hiring|hiring a|looking to hire|headcount)\b/i;

function mentionsCompetitorSwitch(text: string, competitors: string[]): boolean {
  const lower = text.toLowerCase();
  return competitors.some((competitor) => {
    const name = competitor.trim().toLowerCase();
    if (name.length < 2 || !lower.includes(name)) return false;
    return /\b(alternative|switch|switching|replace|replacing|expensive|hate|vs|instead of)\b/.test(lower);
  });
}

/**
 * Cheap first pass. Drops sellers and job seekers, and keeps posts that
 * read like a buyer. The model pass can still reject what this lets through.
 */
export function heuristicQualify(text: string, competitors: string[] = []): HeuristicVerdict {
  if (JOB_SEEKER.test(text)) {
    return { score: 0, intent: "workflow_pain", reject: true, reason: "This is someone looking for a job, not a buyer." };
  }
  if (mentionsCompetitorSwitch(text, competitors)) {
    return { score: 92, intent: "competitor_churn", reject: false, reason: "They're talking about leaving a competitor." };
  }
  if (ASKING.test(text)) {
    return { score: 88, intent: "tool_recommendation", reject: false, reason: "They're asking for a tool in public." };
  }
  if (PAIN.test(text)) {
    return { score: 80, intent: "workflow_pain", reject: false, reason: "They're describing a problem a product could take on." };
  }
  if (HIRING.test(text)) {
    return { score: 72, intent: "hiring_growth", reject: false, reason: "They're hiring, which often means the problem is getting bigger." };
  }
  if (VENDOR.test(text)) {
    return { score: 0, intent: "workflow_pain", reject: true, reason: "This is someone selling, not someone looking to buy." };
  }
  return { score: 35, intent: "workflow_pain", reject: true, reason: "No clear sign they would buy." };
}
