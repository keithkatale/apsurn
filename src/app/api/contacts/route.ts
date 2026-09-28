import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { updateContacts } from "@/lib/prospecting/mutations";
import { listContacts } from "@/lib/agents/shared";
import { setOutreach } from "@/lib/prospects/outreach";

const requestSchema = z
  .object({
    contactIds: z.array(z.string().uuid()).min(1).max(500),
    lead_status: z.enum(["new", "qualified", "contacted", "replied", "won", "lost"]).optional(),
    archived: z.boolean().optional(),
    full_name: z.string().trim().max(200).nullable().optional(),
    title: z.string().trim().max(200).nullable().optional(),
    email: z.string().trim().max(200).nullable().optional(),
    phone: z.string().trim().max(60).nullable().optional(),
    linkedin_url: z.string().trim().max(400).nullable().optional(),
    outreach: z.enum(["in_campaign", "not_in_campaign", "contacted", "not_contacted"]).optional(),
  })
  .refine(
    (body) =>
      body.lead_status !== undefined ||
      body.archived !== undefined ||
      body.full_name !== undefined ||
      body.title !== undefined ||
      body.email !== undefined ||
      body.phone !== undefined ||
      body.linkedin_url !== undefined ||
      body.outreach !== undefined,
    { message: "At least one field to update is required" }
  );

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const query = request.nextUrl.searchParams.get("query") ?? undefined;
  const db = createAdminClient();
  const result = await listContacts(db, userId, { query, limit: Number.isFinite(limit) ? limit : 50 });
  return NextResponse.json(result);
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
  if (parsed.data.outreach) {
    const outreach = await setOutreach(db, userId, parsed.data.contactIds, parsed.data.outreach);
    if (outreach.error) return NextResponse.json({ error: outreach.error, updated: outreach.updated }, { status: 400 });
    return NextResponse.json(outreach);
  }
  const result = await updateContacts(db, userId, parsed.data.contactIds, {
    leadStatus: parsed.data.lead_status,
    archived: parsed.data.archived,
    fullName: parsed.data.full_name,
    title: parsed.data.title,
    email: parsed.data.email,
    phone: parsed.data.phone,
    linkedinUrl: parsed.data.linkedin_url,
  });

  return NextResponse.json(result);
}

const createSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200),
  companyName: z.string().trim().min(1).max(200),
  title: z.string().trim().max(200).optional(),
  domain: z.string().trim().max(200).optional(),
});

function hostFromEmail(email: string) {
  const host = email.split("@")[1]?.trim().toLowerCase().replace(/^www\./, "") ?? "";
  return host.includes(".") ? host : "";
}

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Name, email, and company are required" }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Set up your company first" }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const domain = (parsed.data.domain || hostFromEmail(email) || "manual.local")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();

  const { data: existingCompany } = await db
    .from("prospect_companies")
    .select("id, name, domain")
    .eq("user_id", userId)
    .eq("domain", domain)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();

  let prospect = existingCompany;
  if (!prospect) {
    const { data: created, error } = await db
      .from("prospect_companies")
      .insert({
        user_id: userId,
        company_id: company.id,
        name: parsed.data.companyName,
        domain,
        website_url: domain === "manual.local" ? null : `https://${domain}`,
        source: "manual",
        status: "new",
      })
      .select("id, name, domain")
      .single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? "Could not save company" }, { status: 500 });
    prospect = created;
  }

  const { data: existingContact } = await db
    .from("contacts")
    .select("id, full_name, title, email, email_status, linkedin_url")
    .eq("prospect_company_id", prospect.id)
    .eq("email", email)
    .is("archived_at", null)
    .maybeSingle();

  let contact = existingContact;
  if (!contact) {
    const { data: created, error } = await db
      .from("contacts")
      .insert({
        prospect_company_id: prospect.id,
        full_name: parsed.data.fullName,
        title: parsed.data.title || null,
        email,
        email_status: "unverified",
        source: "manual",
        contact_origin: "manual",
      })
      .select("id, full_name, title, email, email_status, linkedin_url")
      .single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? "Could not save contact" }, { status: 500 });
    contact = created;
  }

  return NextResponse.json({
    contact: {
      id: contact.id,
      fullName: contact.full_name,
      title: contact.title,
      email: contact.email,
      emailStatus: contact.email_status ?? "unverified",
      linkedinUrl: contact.linkedin_url ?? null,
      companyName: prospect.name,
      companyDomain: prospect.domain,
    },
  });
}
