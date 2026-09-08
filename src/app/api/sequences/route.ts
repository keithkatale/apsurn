import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { createSequence, listSequences } from "@/lib/sequences/mutations";

const requestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  steps: z
    .array(
      z.object({
        subject_template: z.string().trim().max(200).nullable().optional(),
        body_template: z.string().trim().min(1).max(5000),
        delay_days: z.number().int().min(0).max(365).default(0),
        stop_on_reply: z.boolean().default(true),
      })
    )
    .min(1)
    .max(10),
});

export async function GET() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const db = createAdminClient();
  const sequences = await listSequences(db, userId);
  return NextResponse.json({ sequences });
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }

  const db = createAdminClient();
  const result = await createSequence(db, userId, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json(result.data, { status: 201 });
}
