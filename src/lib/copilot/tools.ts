import type { AiToolDeclaration } from "@/lib/ai/openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ownedSiteIds } from "@/lib/analytics/access";
import { parseAnalyticsRange, rangeWindow } from "@/lib/analytics/range";
import { scanAllActiveKeywords, scanAllFollowedAccounts } from "@/lib/market/mutations";
import { MARKET_PLATFORMS } from "@/lib/market/types";
import { updateContacts, archiveProspectCompanies } from "@/lib/prospecting/mutations";
import { createSequence, enrollContacts, listSequences } from "@/lib/sequences/mutations";

export const COPILOT_SYSTEM_INSTRUCTION = `You are Copilot, the AI co-pilot built into apsurn — an AI SDR / autonomous prospecting platform for founder-led B2B SaaS companies.

You have read and write access to the signed-in user's own apsurn account: their company blueprint (ICP, personas, positioning), prospected companies and contacts, outreach sequences and enrollments, website analytics, and Market Insights (social listening across X/Twitter, Reddit, YouTube, LinkedIn — tracked keywords, followed accounts, and discovered mentions). You can both answer questions about this data and take real actions on the user's behalf (change a contact's lead status, archive contacts/companies, create a sequence, enroll contacts into a sequence, trigger a Market Insights scan, follow/unfollow an account, mark a mention saved or needing follow-up).

You may be invoked from inside the Market Insights tab, in which case the user's message will be preceded by a "Context:" block describing what they're currently looking at (active filters, visible mention count, any posts they've pinned for you). Treat that block as situational awareness, not as something to repeat back verbatim — use it to answer questions like "what's this post about" or "follow this account" without making the user re-explain what's on their screen, and use the list_market_* tools to fetch full detail on anything referenced there rather than assuming the summary is complete.

Rules:
- Never invent data (contact names, emails, IDs, counts). Always call a tool to look something up before stating a specific fact or acting on a specific record.
- When the user refers to a contact, company, mention, or account by name rather than ID, use list_contacts/list_prospect_companies/list_market_mentions/list_market_accounts with a search query first to resolve the exact record(s) before mutating anything. If more than one match is plausible, ask the user which one they mean rather than guessing.
- Confirm destructive actions (archiving contacts/companies) in your reply after doing them — state exactly what changed and how many records were affected.
- Keep replies concise and concrete: use real numbers and names, not vague summaries.
- If the account has no company blueprint yet, or no prospects/sequences yet, say so plainly and suggest the relevant next step (build a blueprint, run a prospecting search) rather than fabricating data.`;

export const COPILOT_TOOL_DECLARATIONS: AiToolDeclaration[] = [
  {
    name: "get_account_snapshot",
    description:
      "Full briefing on the user's account: company info, blueprint (ICP/personas/value prop), and counts of prospected companies, contacts by lead status, sequences, active enrollments, connected inboxes, and analytics sites. Call this first if you don't already have this context.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_prospect_companies",
    description: "List prospected companies, optionally filtered by status or a name/domain search query.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search by company name or domain (partial match)" },
        status: { type: "string", enum: ["new", "qualified", "rejected", "contacted"] },
        limit: { type: "number", description: "Max results, default 20, max 100" },
      },
    },
  },
  {
    name: "list_contacts",
    description: "List contacts (people at prospected companies), optionally filtered by lead status, company, or a name/email search query.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search by contact full name or email (partial match)" },
        leadStatus: { type: "string", enum: ["new", "qualified", "contacted", "replied", "won", "lost"] },
        companyId: { type: "string", description: "Restrict to contacts at this prospect_company id" },
        limit: { type: "number", description: "Max results, default 20, max 100" },
      },
    },
  },
  {
    name: "get_sequence_overview",
    description: "List all sequences with step/enrollment counts, or (if sequenceId given) full detail on one sequence including its steps and enrolled contacts.",
    parameters: {
      type: "object",
      properties: {
        sequenceId: { type: "string" },
      },
    },
  },
  {
    name: "get_analytics_summary",
    description: "Website analytics summary (unique visitors, page views, bounce rate, avg session time) for a connected analytics site over a time window.",
    parameters: {
      type: "object",
      properties: {
        siteId: { type: "string", description: "Specific analytics site id; if omitted, uses the user's first connected site" },
        range: { type: "string", enum: ["24h", "7d", "30d", "90d"], description: "Defaults to 7d" },
      },
    },
  },
  {
    name: "update_contact_status",
    description: "Change the lead_status of one or more contacts (identified by exact contact id, resolved via list_contacts first).",
    parameters: {
      type: "object",
      properties: {
        contactIds: { type: "array", items: { type: "string" }, minItems: 1 },
        leadStatus: { type: "string", enum: ["new", "qualified", "contacted", "replied", "won", "lost"] },
      },
      required: ["contactIds", "leadStatus"],
    },
  },
  {
    name: "archive_contacts",
    description: "Soft-delete (archive) one or more contacts by id. Reversible only by an admin — confirm with the user before calling if they didn't explicitly ask to delete/remove them.",
    parameters: {
      type: "object",
      properties: {
        contactIds: { type: "array", items: { type: "string" }, minItems: 1 },
      },
      required: ["contactIds"],
    },
  },
  {
    name: "archive_prospect_companies",
    description: "Soft-delete (archive) one or more prospected companies by id, which also archives their contacts.",
    parameters: {
      type: "object",
      properties: {
        companyIds: { type: "array", items: { type: "string" }, minItems: 1 },
      },
      required: ["companyIds"],
    },
  },
  {
    name: "create_sequence",
    description: "Create a new outreach sequence with one or more email steps.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        steps: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              subject_template: { type: "string" },
              body_template: { type: "string" },
              delay_days: { type: "number", description: "Days after the previous step (0 for the first step)" },
            },
            required: ["body_template"],
          },
        },
      },
      required: ["name", "steps"],
    },
  },
  {
    name: "enroll_contacts",
    description: "Enroll one or more contacts (by id) into an existing sequence (by id). Contacts without an email or that are archived are silently skipped.",
    parameters: {
      type: "object",
      properties: {
        sequenceId: { type: "string" },
        contactIds: { type: "array", items: { type: "string" }, minItems: 1 },
      },
      required: ["sequenceId", "contactIds"],
    },
  },
  {
    name: "list_market_keywords",
    description: "List the keywords the user is tracking in Market Insights (social listening across X/Twitter, Reddit, YouTube, LinkedIn), with which platforms each covers.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_market_accounts",
    description: "List social accounts (authors) Market Insights has seen mentions from, optionally only ones the user follows, or matching a name/handle search.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search by account name or handle (partial match)" },
        followedOnly: { type: "boolean" },
        limit: { type: "number", description: "Max results, default 20, max 100" },
      },
    },
  },
  {
    name: "list_market_mentions",
    description: "List social mentions found by Market Insights, with content, author, platform, engagement, and save/follow-up status. Filter by platform, keyword text, a specific account id, or saved-only.",
    parameters: {
      type: "object",
      properties: {
        platform: { type: "string", enum: [...MARKET_PLATFORMS] },
        keyword: { type: "string", description: "Exact keyword text to filter by" },
        accountId: { type: "string" },
        savedOnly: { type: "boolean" },
        limit: { type: "number", description: "Max results, default 20, max 100" },
      },
    },
  },
  {
    name: "trigger_market_scan",
    description: "Run a Market Insights scan now: searches the web for every active keyword and every followed account across their configured platforms, and saves new mentions. Takes a while (multiple web searches) — tell the user you're kicking it off.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "update_market_account_follow",
    description: "Follow or unfollow a social account (by id, resolved via list_market_accounts) so Market Insights keeps tracking (or stops tracking) its own posts going forward.",
    parameters: {
      type: "object",
      properties: {
        accountId: { type: "string" },
        follow: { type: "boolean" },
      },
      required: ["accountId", "follow"],
    },
  },
  {
    name: "update_market_mention",
    description: "Mark a mention (by id, resolved via list_market_mentions) as saved and/or needing follow-up.",
    parameters: {
      type: "object",
      properties: {
        mentionId: { type: "string" },
        isSaved: { type: "boolean" },
        needsFollowUp: { type: "boolean" },
      },
      required: ["mentionId"],
    },
  },
];

function clampLimit(limit: unknown, fallback = 20, max = 100): number {
  const n = typeof limit === "number" ? Math.floor(limit) : fallback;
  return Math.min(Math.max(n, 1), max);
}

export async function getAccountSnapshot(db: SupabaseClient, userId: string) {
  const { data: company } = await db.from("companies").select("*").eq("user_id", userId).maybeSingle();
  if (!company) {
    return { hasCompany: false, message: "No company blueprint yet. The user should build one from the home page." };
  }

  const { data: blueprint } = await db
    .from("company_blueprints")
    .select("icp, personas, value_prop, positioning, approved_at")
    .eq("company_id", company.id)
    .maybeSingle();

  const [{ count: prospectCount }, { count: sequenceCount }, { count: inboxCount }, { count: siteCount }, { data: contactStatusRows }, { count: activeEnrollments }] =
    await Promise.all([
      db.from("prospect_companies").select("id", { count: "exact", head: true }).eq("company_id", company.id).is("archived_at", null),
      db.from("sequences").select("id", { count: "exact", head: true }).eq("company_id", company.id),
      db.from("connected_inboxes").select("id", { count: "exact", head: true }).eq("user_id", userId),
      db.from("analytics_sites").select("id", { count: "exact", head: true }).eq("user_id", userId),
      db
        .from("contacts")
        .select("lead_status, prospect_companies!inner(company_id)")
        .eq("prospect_companies.company_id", company.id)
        .is("archived_at", null),
      db.from("enrollments").select("id, sequences!inner(company_id)", { count: "exact", head: true }).eq("sequences.company_id", company.id).eq("status", "active"),
    ]);

  const leadStatusBreakdown: Record<string, number> = {};
  for (const row of contactStatusRows ?? []) {
    leadStatusBreakdown[row.lead_status] = (leadStatusBreakdown[row.lead_status] ?? 0) + 1;
  }

  return {
    hasCompany: true,
    company: { name: company.name, websiteUrl: company.website_url, status: company.status },
    blueprint: blueprint
      ? {
          approved: !!blueprint.approved_at,
          icp: blueprint.icp,
          personas: blueprint.personas,
          valueProp: blueprint.value_prop,
          positioning: blueprint.positioning,
        }
      : null,
    counts: {
      prospectCompanies: prospectCount ?? 0,
      contactsByLeadStatus: leadStatusBreakdown,
      totalContacts: Object.values(leadStatusBreakdown).reduce((a, b) => a + b, 0),
      sequences: sequenceCount ?? 0,
      activeEnrollments: activeEnrollments ?? 0,
      connectedInboxes: inboxCount ?? 0,
      analyticsSites: siteCount ?? 0,
    },
  };
}

async function listProspectCompanies(
  db: SupabaseClient,
  userId: string,
  args: { query?: string; status?: string; limit?: number }
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

async function listContacts(
  db: SupabaseClient,
  userId: string,
  args: { query?: string; leadStatus?: string; companyId?: string; limit?: number }
) {
  let q = db
    .from("contacts")
    .select("id, full_name, title, email, phone, lead_status, email_status, prospect_companies!inner(id, name, domain, user_id)")
    .eq("prospect_companies.user_id", userId)
    .is("archived_at", null)
    .limit(clampLimit(args.limit));

  if (args.leadStatus) q = q.eq("lead_status", args.leadStatus);
  if (args.companyId) q = q.eq("prospect_company_id", args.companyId);
  if (args.query) q = q.or(`full_name.ilike.%${args.query}%,email.ilike.%${args.query}%`);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return {
    contacts: (data ?? []).map((c) => {
      const company = Array.isArray(c.prospect_companies) ? c.prospect_companies[0] : c.prospect_companies;
      return {
        id: c.id,
        fullName: c.full_name,
        title: c.title,
        email: c.email,
        emailStatus: c.email_status,
        phone: c.phone,
        leadStatus: c.lead_status,
        company: company ? { id: company.id, name: company.name, domain: company.domain } : null,
      };
    }),
  };
}

async function getSequenceOverview(db: SupabaseClient, userId: string, args: { sequenceId?: string }) {
  if (!args.sequenceId) {
    return { sequences: await listSequences(db, userId) };
  }

  const { data: sequence, error } = await db
    .from("sequences")
    .select("id, name, status, sequence_steps(id, step_order, delay_days, subject_template, body_template), enrollments(id, status, current_step, contacts(id, full_name, email))")
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

async function getAnalyticsSummary(db: SupabaseClient, userId: string, args: { siteId?: string; range?: string }) {
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

async function marketCompanyId(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

async function listMarketKeywords(db: SupabaseClient, userId: string) {
  const companyId = await marketCompanyId(db, userId);
  if (!companyId) return { keywords: [] };
  const { data } = await db.from("market_keywords").select("id, keyword, platforms, is_active, last_scanned_at").eq("company_id", companyId);
  return { keywords: data ?? [] };
}

async function listMarketAccounts(db: SupabaseClient, userId: string, args: { query?: string; followedOnly?: boolean; limit?: number }) {
  const companyId = await marketCompanyId(db, userId);
  if (!companyId) return { accounts: [] };

  let q = db
    .from("market_accounts")
    .select("id, platform, handle, name, is_followed")
    .eq("company_id", companyId)
    .limit(clampLimit(args.limit));

  if (args.followedOnly) q = q.eq("is_followed", true);
  if (args.query) q = q.or(`handle.ilike.%${args.query}%,name.ilike.%${args.query}%`);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { accounts: data ?? [] };
}

async function listMarketMentions(
  db: SupabaseClient,
  userId: string,
  args: { platform?: string; keyword?: string; accountId?: string; savedOnly?: boolean; limit?: number }
) {
  const companyId = await marketCompanyId(db, userId);
  if (!companyId) return { mentions: [] };

  let q = db
    .from("market_mentions")
    .select("id, platform, url, author_name, author_handle, content, posted_at, engagement, is_saved, needs_follow_up, market_keywords(keyword)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(clampLimit(args.limit));

  if (args.platform) q = q.eq("platform", args.platform);
  if (args.accountId) q = q.eq("account_id", args.accountId);
  if (args.savedOnly) q = q.eq("is_saved", true);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const keywordOf = (m: (typeof data)[number]): string | undefined => {
    const rel = m.market_keywords as { keyword: string } | { keyword: string }[] | null;
    return Array.isArray(rel) ? rel[0]?.keyword : rel?.keyword;
  };
  const mentions = (data ?? []).filter((m) => !args.keyword || keywordOf(m) === args.keyword);

  return {
    mentions: mentions.map((m) => ({
      id: m.id,
      platform: m.platform,
      url: m.url,
      author: m.author_name || m.author_handle,
      content: m.content,
      postedAt: m.posted_at,
      engagement: m.engagement,
      isSaved: m.is_saved,
      needsFollowUp: m.needs_follow_up,
    })),
  };
}

async function triggerMarketScan(db: SupabaseClient, userId: string) {
  const companyId = await marketCompanyId(db, userId);
  if (!companyId) return { scanned: 0, saved: 0, message: "No company yet — build a blueprint first." };
  const [keywordResult, accountResult] = await Promise.all([
    scanAllActiveKeywords(db, companyId),
    scanAllFollowedAccounts(db, companyId),
  ]);
  return { scanned: keywordResult.scanned + accountResult.scanned, saved: keywordResult.saved + accountResult.saved };
}

async function updateMarketAccountFollow(db: SupabaseClient, userId: string, args: { accountId: string; follow: boolean }) {
  const companyId = await marketCompanyId(db, userId);
  if (!companyId) throw new Error("No company found");
  const { error } = await db.from("market_accounts").update({ is_followed: args.follow }).eq("id", args.accountId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

async function updateMarketMention(db: SupabaseClient, userId: string, args: { mentionId: string; isSaved?: boolean; needsFollowUp?: boolean }) {
  const companyId = await marketCompanyId(db, userId);
  if (!companyId) throw new Error("No company found");
  const update: { is_saved?: boolean; needs_follow_up?: boolean } = {};
  if (args.isSaved !== undefined) update.is_saved = args.isSaved;
  if (args.needsFollowUp !== undefined) update.needs_follow_up = args.needsFollowUp;
  const { error } = await db.from("market_mentions").update(update).eq("id", args.mentionId).eq("company_id", companyId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function runCopilotTool(
  db: SupabaseClient,
  userId: string,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "get_account_snapshot":
      return getAccountSnapshot(db, userId);
    case "list_prospect_companies":
      return listProspectCompanies(db, userId, args);
    case "list_contacts":
      return listContacts(db, userId, args);
    case "get_sequence_overview":
      return getSequenceOverview(db, userId, args as { sequenceId?: string });
    case "get_analytics_summary":
      return getAnalyticsSummary(db, userId, args as { siteId?: string; range?: string });
    case "update_contact_status":
      return updateContacts(db, userId, args.contactIds as string[], {
        leadStatus: args.leadStatus as "new" | "qualified" | "contacted" | "replied" | "won" | "lost",
      });
    case "archive_contacts":
      return updateContacts(db, userId, args.contactIds as string[], { archived: true });
    case "archive_prospect_companies":
      return archiveProspectCompanies(db, userId, args.companyIds as string[]);
    case "create_sequence":
      return createSequence(db, userId, args as { name: string; steps: { body_template: string; subject_template?: string; delay_days?: number }[] });
    case "enroll_contacts":
      return enrollContacts(db, userId, args.sequenceId as string, args.contactIds as string[]);
    case "list_market_keywords":
      return listMarketKeywords(db, userId);
    case "list_market_accounts":
      return listMarketAccounts(db, userId, args as { query?: string; followedOnly?: boolean; limit?: number });
    case "list_market_mentions":
      return listMarketMentions(db, userId, args as { platform?: string; keyword?: string; accountId?: string; savedOnly?: boolean; limit?: number });
    case "trigger_market_scan":
      return triggerMarketScan(db, userId);
    case "update_market_account_follow":
      return updateMarketAccountFollow(db, userId, args as { accountId: string; follow: boolean });
    case "update_market_mention":
      return updateMarketMention(db, userId, args as { mentionId: string; isSaved?: boolean; needsFollowUp?: boolean });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export const COPILOT_MUTATING_TOOLS = new Set([
  "update_contact_status",
  "archive_contacts",
  "archive_prospect_companies",
  "create_sequence",
  "enroll_contacts",
  "trigger_market_scan",
  "update_market_account_follow",
  "update_market_mention",
]);
