import { NextRequest, NextResponse } from "next/server";
import { chooseCampaignIcon } from "@/lib/campaigns/choose-icon";
import { importCsv } from "@/lib/prospects/csv-import";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";
import { createSequence, enrollContacts } from "@/lib/sequences/mutations";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return NextResponse.json({ error: error.message }, { status: 401 });
    throw error;
  }

  const form = await request.formData().catch(() => null);
  const name = String(form?.get("name") ?? "").trim();
  const about = String(form?.get("about") ?? "").trim();
  const file = form?.get("file");
  if (!name || name.length > 80) return NextResponse.json({ error: "Give the campaign a name." }, { status: 400 });
  if (about.length > 500) return NextResponse.json({ error: "Keep the description under 500 characters." }, { status: 400 });
  if (!file || typeof file === "string") return NextResponse.json({ error: "Upload a CSV of the leads for this campaign." }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "File is too large (max 5MB)." }, { status: 400 });
  if (!/\.csv$/i.test(file.name)) return NextResponse.json({ error: "Upload a .csv file." }, { status: 400 });

  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id, name").eq("user_id", userId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Set up your company first." }, { status: 400 });

  const csvText = await file.text();
  let imported: Awaited<ReturnType<typeof importCsv>>;
  try {
    imported = await importCsv(db, userId, company.id, csvText, () => {});
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not read that CSV." }, { status: 400 });
  }
  if (imported.contactIds.length === 0) {
    return NextResponse.json({ error: "No leads in that file could be saved. Include a name or email and a company domain." }, { status: 400 });
  }

  const { data: sampleRows } = await db
    .from("contacts")
    .select("id, full_name, title, email, email_status, linkedin_url, prospect_companies(name, domain)")
    .in("id", imported.contactIds.slice(0, 200));
  type ImportedPerson = {
    id: string;
    full_name: string | null;
    title: string | null;
    email: string | null;
    email_status: string | null;
    linkedin_url: string | null;
    prospect_companies: { name: string | null; domain: string | null } | { name: string | null; domain: string | null }[] | null;
  };
  const samplePeople = (sampleRows ?? []) as ImportedPerson[];
  const companyOf = (row: ImportedPerson) => {
    const company = Array.isArray(row.prospect_companies) ? row.prospect_companies[0] : row.prospect_companies;
    return company ?? null;
  };
  const sample = samplePeople
    .map((row) => [row.title, companyOf(row)?.name].filter(Boolean).join(" at "))
    .filter(Boolean)
    .slice(0, 8)
    .join("; ");

  const description = about || `Leads uploaded from ${file.name}`;
  const iconSvg = await chooseCampaignIcon({ name, description, sample });
  const created = await createSequence(db, userId, {
    name,
    description,
    pain: about || "Uploaded lead list",
    estimatedVolume: imported.contactIds.length,
    iconSvg,
    steps: [
      {
        subject_template: `{{company}} × ${company.name || "us"}`,
        body_template: about
          ? `Hi {{first_name}},\n\n${about}\n\nIf useful I can share how teams like {{company}} handle this.\n`
          : `Hi {{first_name}},\n\nI had a note for the team at {{company}}.\n\nIf useful I can share how teams like yours handle this.\n`,
        delay_days: 0,
        stop_on_reply: true,
      },
    ],
  });
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });

  const enrolled = await enrollContacts(db, userId, created.data.sequenceId, imported.contactIds);
  if (!enrolled.ok) return NextResponse.json({ error: enrolled.error }, { status: enrolled.status });

  const { data: steps } = await db
    .from("sequence_steps")
    .select("id, step_order, delay_days, subject_template, body_template")
    .eq("sequence_id", created.data.sequenceId)
    .order("step_order", { ascending: true });

  return NextResponse.json({
    sequenceId: created.data.sequenceId,
    name,
    description,
    iconSvg,
    contactIds: imported.contactIds,
    enrolled: enrolled.data.enrolled,
    skipped: imported.skipped,
    leads: samplePeople.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      title: row.title,
      email: row.email,
      emailStatus: row.email_status ?? "observed",
      linkedinUrl: row.linkedin_url,
      companyName: companyOf(row)?.name ?? "",
      companyDomain: companyOf(row)?.domain ?? "",
    })),
    steps: (steps ?? []).map((step) => ({
      id: step.id,
      stepOrder: step.step_order,
      delayDays: step.delay_days,
      subject: step.subject_template,
      body: step.body_template,
    })),
  });
}
