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
  return NextResponse.json(result);
}
