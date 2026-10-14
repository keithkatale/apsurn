import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { enrollAllContactsIntoUserSequences } from "@/lib/sequences/mutations";

export async function POST() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const db = createAdminClient();
  const result = await enrollAllContactsIntoUserSequences(db, userId);
  // The campaign setup opens on: the first one defined, so the person lands inside it with its leads and emails.
  const { data: first } = await db
    .from("sequences")
    .select("id")
    .eq("user_id", userId)
    .neq("status", "archived")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return NextResponse.json({ ...result, campaignId: (first?.id as string | undefined) ?? null });
}
