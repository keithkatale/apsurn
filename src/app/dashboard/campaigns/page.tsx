import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  CampaignWorkspace,
  type CampaignLead,
  type CampaignWorkspaceItem,
  type CompanyProfile,
} from "@/components/campaigns/CampaignWorkspace";

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

export default async function CampaignsPage() {
  const supabase = createAdminClient();
  const userId = await getCurrentUserId();

  const { data: company } = await supabase
    .from("companies")
    .select("id,name,website_url")
    .eq("user_id", userId)
    .maybeSingle();

  const [{ data: sequences }, { data: companies }, { data: inbox }, { data: blueprint }] = await Promise.all([
    supabase
      .from("sequences")
      .select("id, name, status, description, pain, estimated_volume, icon_svg, sequence_steps(id, step_order, delay_days, subject_template, body_template)")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
    company
      ? supabase
          .from("prospect_companies")
          .select("id, name, domain, contacts!contacts_prospect_company_id_fkey(id, full_name, title, email, email_status, linkedin_url, archived_at)")
          .eq("company_id", company.id)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from("connected_inboxes")
      .select("email_address")
      .eq("user_id", userId)
      .eq("status", "connected")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    company
      ? supabase
          .from("company_blueprints")
          .select("product_summary,value_prop,positioning,personas")
          .eq("company_id", company.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const leadsById = new Map<string, CampaignLead>();
  for (const row of companies ?? []) {
    const contacts = Array.isArray(row.contacts) ? row.contacts : [];
    for (const contact of contacts) {
      if (!contact || contact.archived_at) continue;
      leadsById.set(contact.id, {
        id: contact.id,
        fullName: contact.full_name,
        title: contact.title,
        email: contact.email,
        emailStatus: contact.email_status ?? "unverified",
        linkedinUrl: contact.linkedin_url ?? null,
        companyName: row.name,
        companyDomain: row.domain,
      });
    }
  }

  const sequenceIds = (sequences ?? []).map((sequence) => sequence.id);
  const { data: enrollmentRows } =
    sequenceIds.length > 0
      ? await supabase.from("enrollments").select("sequence_id, contact_id").in("sequence_id", sequenceIds)
      : { data: [] };

  const { data: draftRows, error: draftLoadError } =
    sequenceIds.length > 0
      ? await supabase
          .from("outreach_drafts")
          .select("contact_id, sequence_id, sequence_step_id, subject, body")
          .eq("user_id", userId)
          .in("sequence_id", sequenceIds)
      : { data: [], error: null };
  const initialDrafts: Record<string, { subject: string; body: string }> = {};
  {
    let rows = draftRows;
    if (draftLoadError) {
      const legacy = sequenceIds.length
        ? await supabase
            .from("outreach_drafts")
            .select("contact_id, sequence_id, subject, body")
            .eq("user_id", userId)
            .in("sequence_id", sequenceIds)
        : { data: [] as Array<{ contact_id: string; sequence_id: string; subject: string; body: string }>, error: null };
      if (legacy.error) console.error("[campaigns] drafts", legacy.error);
      rows = (legacy.data ?? []).map((row) => ({ ...row, sequence_step_id: null as string | null }));
    }
    for (const row of rows ?? []) {
      if (!row.subject?.trim() || !row.body?.trim()) continue;
      const base = `${row.contact_id}:${row.sequence_id}`;
      initialDrafts[base] = { subject: row.subject, body: row.body };
      if (row.sequence_step_id) {
        initialDrafts[`${base}:${row.sequence_step_id}`] = { subject: row.subject, body: row.body };
      }
    }
  }

  const contactIdsBySequence = new Map<string, string[]>();
  for (const row of enrollmentRows ?? []) {
    const list = contactIdsBySequence.get(row.sequence_id) ?? [];
    list.push(row.contact_id);
    contactIdsBySequence.set(row.sequence_id, list);
  }

  const campaigns: CampaignWorkspaceItem[] = (sequences ?? []).map((sequence) => ({
    id: sequence.id,
    name: sequence.name,
    description: asString(sequence.description),
    pain: asString(sequence.pain),
    targeting: [],
    estimatedVolume: typeof sequence.estimated_volume === "number" ? sequence.estimated_volume : null,
    iconSvg: asString(sequence.icon_svg) || null,
    status: sequence.status,
    contactIds: [...new Set(contactIdsBySequence.get(sequence.id) ?? [])],
    steps: [...(sequence.sequence_steps ?? [])]
      .sort((a, b) => a.step_order - b.step_order)
      .map((step) => ({
        id: step.id,
        stepOrder: step.step_order,
        delayDays: step.delay_days,
        subject: step.subject_template,
        body: step.body_template,
      })),
  }));

  const personas = Array.isArray(blueprint?.personas)
    ? blueprint.personas
        .map((persona) => (persona && typeof persona === "object" && "title" in persona ? asString(persona.title) : ""))
        .filter(Boolean)
    : [];

  const profile: CompanyProfile = {
    name: company?.name ?? "Your company",
    websiteUrl: company?.website_url ?? "",
    summary:
      asString(blueprint?.product_summary) ||
      asString(blueprint?.value_prop) ||
      asString(blueprint?.positioning) ||
      "Finish setup so we can describe what you offer.",
    valueProp: asString(blueprint?.value_prop),
    positioning: asString(blueprint?.positioning),
    personas,
  };

  const senderName = (company?.name ?? "there").split(/\s+/)[0] ?? "there";

  return (
    <CampaignWorkspace
      profile={profile}
      campaigns={campaigns}
      leadsById={Object.fromEntries(leadsById)}
      initialDrafts={initialDrafts}
      senderName={senderName}
      hasBlueprint={Boolean(company)}
      inboxEmail={inbox?.email_address ?? null}
    />
  );
}

export const dynamic = "force-dynamic";
