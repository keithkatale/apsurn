import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cronUnauthorized, isCronAuthorized } from "@/lib/jobs/auth";
import { processConversationWakeups } from "@/lib/agents/copilot-wakeup-job";

export const runtime = "nodejs";
// Drains a conversation's wake-ups (analysis after a run, plan steps) for up to ~10 minutes, then re-enqueues itself.
export const maxDuration = 800;

const bodySchema = z.object({ conversationId: z.string().uuid() });

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorized();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  return NextResponse.json(await processConversationWakeups(parsed.data.conversationId));
}
