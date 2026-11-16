import type { AgentDefinition, SpecialistId } from "./types";

export const SPECIALIST_ROSTER: AgentDefinition[] = [
  {
    id: "researcher",
    name: "Researcher",
    job: "Find ICP companies and decision-makers from your approved blueprint.",
    kind: "job",
    starter: "Have Researcher find 10 more ICP companies",
  },
];

export const COPILOT_DEFINITION: AgentDefinition = {
  id: "copilot",
  name: "Copilot",
  job: "Orchestrate research, answer from your account, and confirm risky actions.",
  kind: "loop",
  starter: "Summarize my account and what’s ready to work",
};

export function specialistDefinition(id: SpecialistId): AgentDefinition {
  const found = SPECIALIST_ROSTER.find((agent) => agent.id === id);
  if (!found) throw new Error(`Unknown specialist: ${id}`);
  return found;
}
