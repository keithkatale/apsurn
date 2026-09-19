import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { archiveProspectCompanies, setProspectCompanyStatus } from "@/lib/prospecting/mutations";

const requestSchema = z.union([
  z.object({
    companyIds: z.array(z.string().uuid()).min(1).max(500),
    archived: z.literal(true),
  }),
  z.object({
    companyIds: z.array(z.string().uuid()).min(1).max(500),
    status: z.enum(["qualified", "rejected"]),
    icpFitScore: z.number().min(0).max(1).optional(),
    qualifyReason: z.string().trim().max(500).optional(),
    recommendedContactId: z.string().uuid().nullable().optional(),
  }),
]);

export async function GET() {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ companies: [] });

  const { data: companies, error } = await db
    .from("prospect_companies")
    .select("*, contacts!contacts_prospect_company_id_fkey(*)")
    .eq("company_id", company.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ companies: companies ?? [] });
}

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

  if ("archived" in parsed.data) {
    const result = await archiveProspectCompanies(db, userId, parsed.data.companyIds);
    return NextResponse.json(result);
  }

  const result = await setProspectCompanyStatus(db, userId, parsed.data.companyIds, parsed.data.status, {
    icpFitScore: parsed.data.icpFitScore,
    qualifyReason: parsed.data.qualifyReason,
    recommendedContactId: parsed.data.recommendedContactId,
  });
  return NextResponse.json(result);
}
