import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";

const patchSchema = z.object({
  status: z.enum(["draft", "active", "paused"]).optional(),
  inboxId: z.string().uuid().nullable().optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ sequenceId: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const { sequenceId } = await params;
  const db = createAdminClient();
  const { data: sequence } = await db.from("sequences").select("id, name, status").eq("id", sequenceId).eq("user_id", userId).maybeSingle();
  if (!sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });

  const { data: enrollments } = await db
    .from("enrollments")
    .select("id, status, contacts(full_name, title, email, linkedin_url, prospect_companies(name, domain))")
    .eq("sequence_id", sequenceId)
    .order("started_at", { ascending: true });

  const leads = (enrollments ?? []).map((row) => {
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    const companyRel = contact && typeof contact === "object" ? contact.prospect_companies : null;
    const company = Array.isArray(companyRel) ? companyRel[0] : companyRel;
    return {
      id: row.id,
      status: row.status,
      name: contact?.full_name ?? null,
      title: contact?.title ?? null,
      email: contact?.email ?? null,
      linkedinUrl: contact?.linkedin_url ?? null,
      company: company && typeof company === "object" && "name" in company ? company.name : null,
      domain: company && typeof company === "object" && "domain" in company ? company.domain : null,
    };
  });

  return NextResponse.json({ ...sequence, leads });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ sequenceId: string }> }) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const { sequenceId } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const db = createAdminClient();
  const { data: sequence } = await db.from("sequences").select("id, from_inbox_id").eq("id", sequenceId).eq("user_id", userId).maybeSingle();
  if (!sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });

  const patch: { status?: string; from_inbox_id?: string | null } = {};
  if (parsed.data.status) patch.status = parsed.data.status;
  if (parsed.data.inboxId !== undefined) patch.from_inbox_id = parsed.data.inboxId;
  if (parsed.data.status === "active" && parsed.data.inboxId === undefined && !sequence.from_inbox_id) {
    const { data: inbox } = await db
      .from("connected_inboxes")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inbox?.id) patch.from_inbox_id = inbox.id;
  }

  const { data, error } = await db.from("sequences").update(patch).eq("id", sequenceId).eq("user_id", userId).select("id, status, from_inbox_id").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Could not update sequence" }, { status: 500 });
  return NextResponse.json({
    sequenceId: data.id,
    status: data.status,
    fromInboxId: data.from_inbox_id,
    warning: data.status === "active" && !data.from_inbox_id ? "Connect Gmail before sending." : undefined,
  });
}
