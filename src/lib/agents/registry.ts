import type { AgentDefinition, SpecialistId } from "./types";

export const SPECIALIST_ROSTER: AgentDefinition[] = [
  {
    id: "researcher",
    name: "Researcher",
    job: "Find ICP companies and decision-makers from your approved blueprint.",
    kind: "job",
    starter: "Have Researcher find 10 more ICP companies",
  },
  {
    id: "listener",
    name: "Listener",
    job: "Scan X, Reddit, and LinkedIn for buying signals and flag posts.",
    kind: "job",
    starter: "Have Listener scan my keywords for new mentions",
  },
  {
    id: "writer",
    name: "Writer",
    job: "Draft outreach emails. Does not send.",
    kind: "loop",
    starter: "Have Writer draft an opener for my best qualified contact",
  },
  {
    id: "operator",
    name: "Operator",
    job: "Move the pipeline: enroll, update status, send only when you say so.",
    kind: "loop",
    starter: "Have Operator create a sequence for my ICP",
  },
];

export const COPILOT_DEFINITION: AgentDefinition = {
  id: "copilot",
  name: "Copilot",
  job: "Orchestrate the specialists, answer from your account, and confirm risky actions.",
  kind: "loop",
  starter: "Summarize my account and what’s ready to work",
};

export function specialistDefinition(id: SpecialistId): AgentDefinition {
  const found = SPECIALIST_ROSTER.find((agent) => agent.id === id);
  if (!found) throw new Error(`Unknown specialist: ${id}`);
  return found;
}
