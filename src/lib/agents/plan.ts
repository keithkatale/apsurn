/**
 * create_plan: turns a multi-step request into a durable agent task the user
 * approves once (with a credit budget) before it runs in the background.
 */
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { publishArtifact } from "@/lib/copilot/artifacts";
import { specialistForTool } from "./delegate";
import { estimatePlanCost, validatePlan } from "./plan-core";
import type { AgentToolContext } from "./types";

export const CREATE_PLAN_TOOL = "create_plan";

export async function createPlan(ctx: AgentToolContext, args: Record<string, unknown>) {
  if (!ctx.conversationId) return { error: "Plans can only be created inside a Copilot task." };

  const validated = validatePlan(args);
  if (!validated.ok) return { error: validated.error };
  const { goal, steps } = validated.plan;

  const unknownTool = steps.find((step) => step.tool && !specialistForTool(step.tool));
  if (unknownTool) {
    return { error: `Step "${unknownTool.title}" names a tool that doesn't exist (${unknownTool.tool}). Drop the tool field and describe the work in the instruction instead.` };
  }

  const estimate = estimatePlanCost(steps, CREDIT_COSTS);
  const requestedBudget = Number(args.budget_credits);
  const budget = Number.isFinite(requestedBudget) && requestedBudget > 0 ? Math.floor(requestedBudget) : estimate.high;

  const { data: task, error } = await ctx.db
    .from("agent_tasks")
    .insert({
      user_id: ctx.userId,
      conversation_id: ctx.conversationId,
      status: "awaiting_approval",
      goal,
      plan: { goal, steps, estimate },
      budget_credits: budget,
    })
    .select("id")
    .single();
  if (error || !task) {
    if (error && /relation .*agent_tasks|does not exist/i.test(error.message)) {
      return { error: "Background tasks need a database update. Run supabase/migrations/0029_agent_tasks.sql in the Supabase SQL editor." };
    }
    return { error: error?.message ?? "Could not save the plan." };
  }

  const { error: stepsError } = await ctx.db.from("agent_task_steps").insert(
    steps.map((step, idx) => ({
      task_id: task.id,
      idx,
      title: step.title,
      agent: step.agent,
      instruction: step.instruction,
      tool: step.tool ?? null,
      args: step.args ?? {},
      est_credits: estimate.perStep[idx] ?? 0,
    })),
  );
  if (stepsError) return { error: stepsError.message };

  const artifact = await publishArtifact(ctx, {
    kind: "plan",
    title: goal.length > 80 ? `${goal.slice(0, 77)}…` : goal,
    payload: { taskId: task.id, goal, steps, estimate, budget },
  });

  return {
    planned: true,
    taskId: task.id,
    artifactId: artifact?.id,
    estimate,
    budget,
    note: "The plan card is on screen with Approve / Cancel. Stop here: say in one sentence what the plan does and its estimated credits, then wait for the user to approve.",
  };
}
