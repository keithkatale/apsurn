import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { enqueueInternalJob } from "@/lib/jobs/enqueue";
import { runOutreachSendPass } from "@/lib/outreach/pass";

const bodySchema = z.object({
  /** When true, run inline instead of queueing a background job. */
  sync: z.boolean().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

/**
 * Explicit send action — never auto-fires after prospecting.
 * Activates OpenOutSend-style one pass for the signed-in user.
 */
export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (parsed.data.sync) {
    const result = await runOutreachSendPass({
      userId,
      limit: parsed.data.limit,
    });
    return NextResponse.json(result);
  }

  enqueueInternalJob(
    "/api/cron/outreach-send-pass",
    { userId },
    () => runOutreachSendPass({ userId, limit: parsed.data.limit }),
  );
  return NextResponse.json({ queued: true });
}
