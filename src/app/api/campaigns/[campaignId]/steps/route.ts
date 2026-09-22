import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { addSequenceStep } from "@/lib/sequences/mutations";

export const runtime = "nodejs";

const bodySchema = z.object({
  delayDays: z.number().int().min(0).max(60).default(3),
});

async function userIdOr401() {
  try {
    return await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return null;
    throw error;
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ campaignId: string }> }) {
  const userId = await userIdOr401();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { campaignId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const result = await addSequenceStep(db, userId, campaignId, { delayDays: parsed.data.delayDays });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
