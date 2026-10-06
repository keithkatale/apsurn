/**
 * Pure plan validation and cost estimation for durable agent tasks. No
 * runtime `@/` imports, so it runs under node:test (see plan-core.test.ts).
 */

export const PLAN_AGENT_IDS = ["researcher", "listener", "writer", "operator", "signal_scout"] as const;
export type PlanAgentId = (typeof PLAN_AGENT_IDS)[number];

export const MAX_PLAN_STEPS = 8;

export interface PlanStep {
  title: string;
  agent: PlanAgentId;
  instruction: string;
  tool?: string;
  args?: Record<string, unknown>;
}

export interface ValidatedPlan {
  goal: string;
  steps: PlanStep[];
}

/** The subset of CREDIT_COSTS (src/lib/billing/plans.ts) an estimate needs, passed in to keep this file pure. */
export interface PlanCreditCosts {
  copilot_turn: number;
  prospect_company: number;
  email_find: number;
  email_draft: number;
  market_scan: number;
  lead_source_scan: number;
}

export interface PlanEstimate {
  low: number;
  high: number;
  perStep: number[];
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isPlanAgent(value: unknown): value is PlanAgentId {
  return typeof value === "string" && (PLAN_AGENT_IDS as readonly string[]).includes(value);
}

/** Accepts the model's create_plan arguments; returns a clean plan or a message the model can act on. */
export function validatePlan(args: Record<string, unknown>): { ok: true; plan: ValidatedPlan } | { ok: false; error: string } {
  const goal = text(args.goal, 500);
  if (!goal) return { ok: false, error: "A plan needs a goal." };
  if (!Array.isArray(args.steps) || args.steps.length === 0) return { ok: false, error: "A plan needs at least one step." };
  if (args.steps.length > MAX_PLAN_STEPS) {
    return { ok: false, error: `Keep plans to ${MAX_PLAN_STEPS} steps or fewer — merge related work into one step.` };
  }

  const steps: PlanStep[] = [];
  for (const [index, raw] of args.steps.entries()) {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const title = text(row.title, 120);
    const instruction = text(row.instruction, 2000);
    if (!title || !instruction) return { ok: false, error: `Step ${index + 1} needs a title and an instruction.` };
    if (!isPlanAgent(row.agent)) {
      return { ok: false, error: `Step ${index + 1} has an unknown agent. Use one of: ${PLAN_AGENT_IDS.join(", ")}.` };
    }
    const tool = text(row.tool, 80) || undefined;
    const args = row.args && typeof row.args === "object" && !Array.isArray(row.args) ? (row.args as Record<string, unknown>) : undefined;
    steps.push({ title, agent: row.agent, instruction, tool, args });
  }
  return { ok: true, plan: { goal, steps } };
}

// "25 SaaS companies", "10 new Series A accounts": up to three descriptor words between number and noun.
const LEAD_COUNT = /\b(\d{1,3})\s+(?:[\w-]+\s+){0,3}?(?:leads?|compan(?:y|ies)|contacts?|prospects?|accounts?|businesses|founders|people)\b/i;
const DRAFT_COUNT = /\b(\d{1,3})\s+(?:[\w-]+\s+){0,2}?(?:emails?|drafts?|messages?)\b/i;

/** How many leads a step will try to save: explicit args first, then a number in the instruction. */
export function leadTargetOf(step: PlanStep): number {
  const fromArgs = Number(step.args?.limit ?? step.args?.targetLeadCount);
  if (Number.isFinite(fromArgs) && fromArgs > 0) return Math.min(200, Math.floor(fromArgs));
  const match = step.instruction.match(LEAD_COUNT) ?? step.title.match(LEAD_COUNT);
  return match ? Math.min(200, Number(match[1])) : 10;
}

function draftCountOf(step: PlanStep): number {
  const match = step.instruction.match(DRAFT_COUNT) ?? step.title.match(DRAFT_COUNT);
  return match ? Math.min(200, Number(match[1])) : 5;
}

/**
 * A low–high credit range. High assumes every lead needs a paid lookup; low
 * assumes half are already in the canonical index. The high figure is the
 * default task budget, so an approved task can't overspend its estimate.
 */
export function estimatePlanCost(steps: PlanStep[], costs: PlanCreditCosts): PlanEstimate {
  const ORCHESTRATION_ROUNDS = 3;
  let low = 0;
  let high = 0;
  const perStep: number[] = [];

  for (const step of steps) {
    const turns = costs.copilot_turn * ORCHESTRATION_ROUNDS;
    let stepLow = turns;
    let stepHigh = turns;

    if (step.agent === "researcher" || step.agent === "signal_scout") {
      const leads = leadTargetOf(step);
      const perLead = costs.prospect_company + costs.email_find;
      stepHigh += leads * perLead;
      stepLow += Math.ceil(leads / 2) * perLead + Math.floor(leads / 2) * costs.prospect_company;
      if (step.agent === "signal_scout") {
        stepHigh += costs.lead_source_scan * 2;
        stepLow += costs.lead_source_scan;
      }
    } else if (step.agent === "listener") {
      stepHigh += costs.market_scan;
      stepLow += costs.market_scan;
    } else if (step.agent === "writer") {
      const drafts = draftCountOf(step);
      stepHigh += drafts * costs.email_draft;
      stepLow += drafts * costs.email_draft;
    }

    perStep.push(stepHigh);
    low += stepLow;
    high += stepHigh;
  }
  return { low, high, perStep };
}
