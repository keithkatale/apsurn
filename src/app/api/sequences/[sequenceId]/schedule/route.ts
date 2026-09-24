import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";

const bodySchema = z.object({
  startAt: z.string().datetime().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ sequenceId: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const { sequenceId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const { data: sequence } = await db.from("sequences").select("id, status").eq("id", sequenceId).eq("user_id", userId).maybeSingle();
  if (!sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });

  const startAt = parsed.data.startAt ?? new Date(Date.now() + 60 * 60_000).toISOString();
  if (sequence.status !== "active") {
    await db.from("sequences").update({ status: "active" }).eq("id", sequenceId).eq("user_id", userId);
  }
  const { data, error } = await db
    .from("enrollments")
    .update({ next_send_at: startAt, status: "active" })
    .eq("sequence_id", sequenceId)
    .in("status", ["active", "paused"])
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ scheduled: data?.length ?? 0, startAt });
}
