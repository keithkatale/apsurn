import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { updateContacts } from "@/lib/prospecting/mutations";

const requestSchema = z
  .object({
    contactIds: z.array(z.string().uuid()).min(1).max(500),
    lead_status: z.enum(["new", "qualified", "contacted", "replied", "won", "lost"]).optional(),
    archived: z.boolean().optional(),
  })
  .refine((body) => body.lead_status !== undefined || body.archived !== undefined, {
    message: "At least one of lead_status or archived is required",
  });

export async function PATCH(request: NextRequest) {
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
  const result = await updateContacts(db, userId, parsed.data.contactIds, {
    leadStatus: parsed.data.lead_status,
    archived: parsed.data.archived,
  });

  return NextResponse.json(result);
}
