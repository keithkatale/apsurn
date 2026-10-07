import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cronUnauthorized, isCronAuthorized } from "@/lib/jobs/auth";
import { draftOpenersForLeads } from "@/lib/outreach/lead-draft";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
// A large enrollment is a few model calls per lead; leads left over are written by the send pass.
export const maxDuration = 800;

const bodySchema = z.object({
  userId: z.string().uuid(),
  sequenceId: z.string().uuid(),
  contactIds: z.array(z.string().uuid()).min(1).max(2000),
});

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) return cronUnauthorized();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { userId, sequenceId, contactIds } = parsed.data;
  return NextResponse.json(await draftOpenersForLeads(createAdminClient(), userId, sequenceId, contactIds));
}
