import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cronUnauthorized, isCronAuthorized } from "@/lib/jobs/auth";
import { executeAgentTaskSlice } from "@/lib/agents/task-executor";

export const runtime = "nodejs";
// One slice runs ~10 minutes (AGENT_SLICE_MS) and then re-enqueues itself.
export const maxDuration = 800;

const bodySchema = z.object({ taskId: z.string().uuid() });

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorized();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  return NextResponse.json(await executeAgentTaskSlice(parsed.data.taskId));
}
