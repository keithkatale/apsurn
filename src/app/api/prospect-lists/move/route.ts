import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";

const schema = z.object({ listId: z.string().uuid(), companyIds: z.array(z.string().uuid()).min(1).max(500) });

/** Put companies (with their contacts) into a list. A company sits in one list at a time; the general list shows them all. */
export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const { data: list } = await db.from("prospect_lists").select("id").eq("id", parsed.data.listId).eq("user_id", userId).maybeSingle();
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  // One at a time: a domain that is already in the target list is skipped instead of failing the whole move.
  let moved = 0;
  for (const id of parsed.data.companyIds) {
    const { error } = await db.from("prospect_companies").update({ list_id: list.id }).eq("id", id).eq("user_id", userId);
    if (!error) moved += 1;
  }
  return NextResponse.json({ moved });
}
