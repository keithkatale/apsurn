import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { archiveProspectCompanies } from "@/lib/prospecting/mutations";

const requestSchema = z.object({
  companyIds: z.array(z.string().uuid()).min(1).max(500),
  archived: z.literal(true),
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
  const result = await archiveProspectCompanies(db, userId, parsed.data.companyIds);

  return NextResponse.json(result);
}
