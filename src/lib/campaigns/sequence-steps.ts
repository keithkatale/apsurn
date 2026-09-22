import type { CampaignEmailStep } from "@/components/campaigns/CampaignWorkspace";

/** Follow-ups seeded at campaign setup — hidden until the user or AI adds steps on the canvas. */
export function isOnboardingAutoFollowup(step: CampaignEmailStep): boolean {
  const body = (step.body ?? "").trim();
  const subject = (step.subject ?? "").trim();
  if (!body && !subject) return false;
  if (body.includes("Following up in case this was buried")) return true;
  if (body.includes("Happy to send a short outline")) return true;
  if (/^Re:\s*\{\{company\}\}/i.test(subject) && body.includes("{{first_name}}")) return true;
  return false;
}

export function sortCampaignSteps(steps: CampaignEmailStep[]): CampaignEmailStep[] {
  return [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
}

/** Steps shown on the sequence canvas (opener + user/AI follow-ups, not auto-seeded bumps). */
export function canvasVisibleSteps(steps: CampaignEmailStep[]): CampaignEmailStep[] {
  const sorted = sortCampaignSteps(steps);
  if (sorted.length === 0) return [];
  const opener = sorted[0];
  const followups = sorted.slice(1).filter((step) => !isOnboardingAutoFollowup(step));
  return [opener, ...followups];
}

export function openerStepOnly(steps: CampaignEmailStep[]): CampaignEmailStep[] {
  const sorted = sortCampaignSteps(steps);
  return sorted.length > 0 ? [sorted[0]] : [];
}
