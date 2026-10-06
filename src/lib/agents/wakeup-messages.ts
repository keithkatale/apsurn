/**
 * The synthetic messages that resume a Copilot conversation when something
 * happened outside the chat (a run finished, a plan was approved). Pure string
 * building with no runtime `@/` imports so it can run under
 * `node --experimental-strip-types` (see wakeup-messages.test.ts).
 */

export const ACTIVE_RUN_STATUSES = ["queued", "discovering", "enriching", "verifying"] as const;

export function isActiveRunStatus(status: string | null | undefined): boolean {
  return Boolean(status) && (ACTIVE_RUN_STATUSES as readonly string[]).includes(status as string);
}

export interface RunOutcomeContact {
  name: string;
  title: string;
  email: string;
  emailStatus: string;
}

export interface RunOutcomeCompany {
  name: string;
  domain: string;
  industry: string;
  fit: number | null;
  reason: string;
  contacts: RunOutcomeContact[];
}

export interface RunOutcome {
  runId: string;
  status: string;
  target: number;
  saved: number;
  contacts: number;
  error: string | null;
  /** Best first, capped by the loader. */
  companies: RunOutcomeCompany[];
  /** Headlines of the buying signals behind the saved companies. */
  signals: string[];
}

export interface PlanStepLine {
  idx: number;
  title: string;
  agent: string | null;
  instruction: string;
  status: string;
  resultSummary?: string | null;
}

const TERMINAL_STEP_STATUSES = ["done", "failed", "skipped"];

export function pendingSteps(steps: PlanStepLine[]): PlanStepLine[] {
  return steps.filter((step) => !TERMINAL_STEP_STATUSES.includes(step.status));
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Compact, model-readable result of a run: counts first, then the strongest companies with their contacts. */
export function formatRunOutcome(outcome: RunOutcome): string {
  const lines = [
    `Run ${outcome.runId} ${outcome.status}: saved ${outcome.saved}/${outcome.target} companies, ${outcome.contacts} contacts.${outcome.error ? ` Problem: ${clip(outcome.error, 300)}` : ""}`,
  ];
  if (outcome.companies.length === 0) {
    lines.push("No companies were saved.");
  } else {
    lines.push("Saved companies (best fit first):");
    outcome.companies.forEach((company, i) => {
      const head = [company.name, company.domain && `(${company.domain})`, company.industry, company.fit != null ? `fit ${company.fit}` : ""].filter(Boolean).join(" ");
      lines.push(`${i + 1}. ${head}${company.reason ? ` — why: ${clip(company.reason, 200)}` : ""}`);
      for (const contact of company.contacts.slice(0, 3)) {
        const who = [contact.name, contact.title && `, ${contact.title}`].filter(Boolean).join("");
        lines.push(`   - ${who || "Unnamed contact"}${contact.email ? ` <${contact.email}>${contact.emailStatus ? ` [${contact.emailStatus}]` : ""}` : " (no email)"}`);
      }
    });
  }
  if (outcome.signals.length > 0) {
    lines.push("Buying signals found:");
    for (const headline of outcome.signals.slice(0, 8)) lines.push(`- ${clip(headline, 160)}`);
  }
  return lines.join("\n");
}

export function formatPlanSteps(steps: PlanStepLine[]): string {
  return steps
    .map((step) => {
      const status = step.status === "pending" ? "" : ` [${step.status}]`;
      const result = step.resultSummary ? ` — ${clip(step.resultSummary, 160)}` : "";
      return `${step.idx + 1}. ${step.title}${step.agent ? ` (${step.agent})` : ""}${status}${result}`;
    })
    .join("\n");
}

export function buildRunCompletedMessage(outcome: RunOutcome, plan?: { goal: string; steps: PlanStepLine[] } | null): string {
  const parts = [
    "[Automatic update — the user did not write this message.] The prospecting run you started has finished.",
    formatRunOutcome(outcome),
    "Now analyze it for the user: how well these companies and contacts fit the approved blueprint, which are the strongest and why, what is weak or missing (no email, thin signals, fewer than requested), and what you recommend next. Use real names and numbers from above; call list_contacts or list_prospect_companies only if you need more detail. Be concise and end with one concrete next step.",
  ];
  if (plan && pendingSteps(plan.steps).length > 0) {
    parts.push(
      `This run belongs to the approved plan "${plan.goal}". Plan so far:\n${formatPlanSteps(plan.steps)}\nMark the run's step complete with complete_plan_step using what you found, then continue with the remaining steps.`,
    );
  }
  return parts.join("\n\n");
}

export function buildPlanMessage(kind: "approved" | "continue", goal: string, steps: PlanStepLine[]): string {
  const lead =
    kind === "approved"
      ? "[Automatic update — the user did not write this message.] The user approved your plan. Run it now, in this conversation."
      : "[Automatic update — the user did not write this message.] Continue the approved plan where you left off.";
  return [
    lead,
    `Goal: ${goal}`,
    `Steps:\n${formatPlanSteps(steps)}`,
    "Work through the unfinished steps in order, one at a time, like a normal chat turn: call the tools or delegate_to_agent for the step, look at the result, then call complete_plan_step with the step number and a one-paragraph summary using real names and numbers. A step that starts a prospecting run is not finished until you have waited for it (the researcher uses await_run) and looked at what it saved. Do not ask the user to approve again. Stop and ask only before an irreversible action (sending email, activating a sequence). When every step is complete, write a short wrap-up for the user.",
  ].join("\n\n");
}
