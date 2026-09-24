import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { spendCredits } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { findEmail, findPeopleAtCompany } from "@/lib/prospecting/icypeas";
import { getOwnedArtifact, updateArtifact } from "@/lib/copilot/artifacts";
import type { SourcedLeadRow } from "@/lib/agents/source-leads";

const bodySchema = z.object({
  rowIds: z.array(z.string().min(1)).min(1).max(25),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Select rows that need an email." }, { status: 400 });

  const db = createAdminClient();
  const artifact = await getOwnedArtifact(db, userId, id);
  if (!artifact || artifact.kind !== "lead_table") return NextResponse.json({ error: "Lead table not found" }, { status: 404 });

  const rows = Array.isArray(artifact.payload.rows) ? (artifact.payload.rows as SourcedLeadRow[]) : [];
  let found = 0;
  let spent = 0;
  const next = [...rows];
  for (let index = 0; index < next.length; index += 1) {
    const row = next[index];
    if (!parsed.data.rowIds.includes(row.id) || row.email || !row.domain) continue;
    try {
      await spendCredits({
        userId,
        amount: CREDIT_COSTS.email_find,
        action: "email_find",
        metadata: { artifactId: id, domain: row.domain },
      });
      spent += CREDIT_COSTS.email_find;
    } catch (error) {
      const code = (error as { code?: string }).code;
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Not enough credits", code, found, creditsSpent: spent, artifact },
        { status: code === "credits_exhausted" ? 402 : 500 },
      );
    }
    const people = await findPeopleAtCompany(row.domain, row.title ? [row.title] : [], 1);
    const person = people?.[0];
    const email = person ? await findEmail(person.fullName, row.domain) : null;
    next[index] = {
      ...row,
      fullName: row.fullName || person?.fullName || null,
      title: row.title || person?.title || null,
      email: email?.email ?? null,
      emailStatus: email?.status ?? null,
    };
    if (email?.email) found += 1;
  }

  const updated = await updateArtifact(db, userId, id, { payload: { ...artifact.payload, rows: next } });
  return NextResponse.json({ found, creditsSpent: spent, artifact: updated });
}
