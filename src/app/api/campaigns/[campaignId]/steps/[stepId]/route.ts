import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { deleteSequenceStep, updateSequenceStep } from "@/lib/sequences/mutations";

export const runtime = "nodejs";

const patchSchema = z.object({
  delayDays: z.number().int().min(0).max(60).optional(),
  subjectTemplate: z.string().max(200).nullable().optional(),
  bodyTemplate: z.string().max(20000).optional(),
});

async function userIdOr401() {
  try {
    return await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return null;
    throw error;
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ campaignId: string; stepId: string }> }) {
  const userId = await userIdOr401();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { campaignId, stepId } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const result = await updateSequenceStep(db, userId, campaignId, stepId, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ campaignId: string; stepId: string }> }) {
  const userId = await userIdOr401();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { campaignId, stepId } = await context.params;
  const db = createAdminClient();
  const result = await deleteSequenceStep(db, userId, campaignId, stepId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.data);
}
