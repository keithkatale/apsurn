import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { approveAgentTask } from "@/lib/agents/plan-approval";

const bodySchema = z.object({ budget: z.number().int().positive().max(100_000).optional() });

/** Approve a planned task (or resume one paused on its budget) and start it. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid budget" }, { status: 400 });

  const result = await approveAgentTask(userId, id, parsed.data.budget);
  if (!result.ok) return NextResponse.json({ error: result.error, ...(result.code ? { code: result.code } : {}) }, { status: result.httpStatus });
  return NextResponse.json({ status: result.status, budget: result.budget });
}
