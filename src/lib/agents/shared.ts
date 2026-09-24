import type { SupabaseClient } from "@supabase/supabase-js";
import { ownedSiteIds } from "@/lib/analytics/access";
import { parseAnalyticsRange, rangeWindow } from "@/lib/analytics/range";
import { listSequences } from "@/lib/sequences/mutations";

export function clampLimit(limit: unknown, fallback = 20, max = 100): number {
  const n = typeof limit === "number" ? Math.floor(limit) : fallback;
  return Math.min(Math.max(n, 1), max);
}

export async function userCompanyId(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

export async function listProspectCompanies(
  db: SupabaseClient,
  userId: string,
  args: { query?: string; status?: string; limit?: number },
) {
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  if (!company) return { companies: [] };

  let q = db
    .from("prospect_companies")
    .select("id, name, domain, industry, location, status, icp_fit_score, contacts!contacts_prospect_company_id_fkey(id)")
    .eq("company_id", company.id)
    .is("archived_at", null)
    .limit(clampLimit(args.limit));

  if (args.status) q = q.eq("status", args.status);
  if (args.query) q = q.or(`name.ilike.%${args.query}%,domain.ilike.%${args.query}%`);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return {
    companies: (data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      domain: c.domain,
      industry: c.industry,
      location: c.location,
      status: c.status,
      icpFitScore: c.icp_fit_score,
      contactCount: (c.contacts ?? []).length,
    })),
  };
}

export async function listContacts(
  db: SupabaseClient,
  userId: string,
  args: { query?: string; leadStatus?: string; companyId?: string; limit?: number },
) {
  let q = db
    .from("contacts")
    .select("id, full_name, title, email, phone, linkedin_url, lead_status, email_status, created_at, prospect_companies!inner(id, name, domain, user_id)")
    .eq("prospect_companies.user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(clampLimit(args.limit));

  if (args.leadStatus) q = q.eq("lead_status", args.leadStatus);
  if (args.companyId) q = q.eq("prospect_company_id", args.companyId);
  if (args.query) q = q.or(`full_name.ilike.%${args.query}%,email.ilike.%${args.query}%`);

  const { data, error } = await q;
  if (error) {
    const { data: companies } = await db
      .from("prospect_companies")
      .select("id, name, domain")
      .eq("user_id", userId)
      .is("archived_at", null);
    const companyIds = (companies ?? []).map((row) => row.id);
    if (companyIds.length === 0) return { contacts: [] };
    const companyById = new Map((companies ?? []).map((row) => [row.id, row]));
    let fallback = db
      .from("contacts")
      .select("id, full_name, title, email, phone, linkedin_url, lead_status, email_status, created_at, prospect_company_id")
      .in("prospect_company_id", companyIds)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(clampLimit(args.limit));
    if (args.leadStatus) fallback = fallback.eq("lead_status", args.leadStatus);
    if (args.companyId) fallback = fallback.eq("prospect_company_id", args.companyId);
    if (args.query) fallback = fallback.or(`full_name.ilike.%${args.query}%,email.ilike.%${args.query}%`);
    const retry = await fallback;
    if (retry.error) throw new Error(error.message);
    return {
      contacts: (retry.data ?? []).map((c) => {
        const company = companyById.get(c.prospect_company_id);
        return {
          id: c.id,
          fullName: c.full_name,
          title: c.title,
          email: c.email,
          linkedinUrl: c.linkedin_url,
          emailStatus: c.email_status,
          phone: c.phone,
          leadStatus: c.lead_status,
          company: company ? { id: company.id, name: company.name, domain: company.domain } : null,
        };
      }),
    };
  }

  return {
    contacts: (data ?? []).map((c) => {
      const company = Array.isArray(c.prospect_companies) ? c.prospect_companies[0] : c.prospect_companies;
      return {
        id: c.id,
        fullName: c.full_name,
        title: c.title,
        email: c.email,
        linkedinUrl: c.linkedin_url,
        emailStatus: c.email_status,
        phone: c.phone,
        leadStatus: c.lead_status,
        company: company ? { id: company.id, name: company.name, domain: company.domain } : null,
      };
    }),
  };
}

export async function getSequenceOverview(db: SupabaseClient, userId: string, args: { sequenceId?: string }) {
  if (!args.sequenceId) {
    return { sequences: await listSequences(db, userId) };
  }

  const { data: sequence, error } = await db
    .from("sequences")
    .select("id, name, status, from_inbox_id, sequence_steps(id, step_order, delay_days, subject_template, body_template), enrollments(id, status, current_step, contacts(id, full_name, email))")
    .eq("id", args.sequenceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!sequence) return { error: "Sequence not found" };

  return {
    sequence: {
      id: sequence.id,
      name: sequence.name,
      status: sequence.status,
      fromInboxId: sequence.from_inbox_id,
      steps: (sequence.sequence_steps ?? []).sort((a, b) => a.step_order - b.step_order),
      enrollments: (sequence.enrollments ?? []).map((e) => ({
        id: e.id,
        status: e.status,
        currentStep: e.current_step,
        contact: e.contacts,
      })),
    },
  };
}

export async function getAnalyticsSummary(db: SupabaseClient, userId: string, args: { siteId?: string; range?: string }) {
  const siteIds = await ownedSiteIds(userId, args.siteId ?? null);
  if (siteIds.length === 0) {
    return { hasSite: false, message: "No analytics site connected yet." };
  }

  const range = parseAnalyticsRange(args.range ?? null);
  const { start } = rangeWindow(range);

  const [{ count: pageViews }, { data: sessions }] = await Promise.all([
    db.from("analytics_page_views").select("id", { count: "exact", head: true }).gte("timestamp", start.toISOString()).in("site_id", siteIds),
    db.from("analytics_sessions").select("visitor_id, duration, page_views").gte("started_at", start.toISOString()).in("site_id", siteIds),
  ]);

  const uniqueVisitors = new Set((sessions ?? []).map((s) => s.visitor_id)).size;
  const totalSessions = sessions?.length ?? 0;
  const bouncedSessions = (sessions ?? []).filter((s) => s.page_views === 1).length;
  const totalDuration = (sessions ?? []).reduce((sum, s) => sum + (s.duration ?? 0), 0);

  return {
    hasSite: true,
    range,
    visitors: uniqueVisitors,
    pageViews: pageViews ?? 0,
    bounceRatePercent: totalSessions > 0 ? Math.round((bouncedSessions / totalSessions) * 1000) / 10 : 0,
    avgSessionSeconds: totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0,
  };
}

export function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, max);
}
