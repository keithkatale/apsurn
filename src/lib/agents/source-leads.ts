import { runOrganicSignalRadar, scanFastWave } from "@/lib/prospecting/radar";
import { LeadGenerator, type RealEstateLead } from "@/lib/prospecting/real-estate";
import { verifyEmail } from "@/lib/prospecting/email-verifier";
import { spendCredits } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { searchLinkedInMentions } from "@/lib/market/linkedin";
import { searchRedditMentions } from "@/lib/market/reddit";
import { searchTwitterMentions } from "@/lib/market/twitter";
import { findEmail, findPeopleAtCompany } from "@/lib/prospecting/icypeas";
import { searchYcLeads } from "@/lib/prospecting/yc-leads";
import { hasEmailOrLinkedIn, linkedInProfile } from "@/lib/prospecting/reachable";
import { findCompanies, LEAD_SOURCES, type LeadSourceId } from "@/lib/prospecting/sources";
import { assertSafePublicUrl, crawlSite } from "@/lib/scraper/crawl";
import { extractCompaniesFromPage } from "@/lib/prospecting/agent/shared";
import { fetchPage } from "@/lib/scraper/fetch-page";
import type { ProspectCriteria } from "@/lib/prospecting/types";
import { publishArtifact, updateArtifact } from "@/lib/copilot/artifacts";
import { stringList, userCompanyId } from "./shared";
import type { AgentToolContext } from "./types";

export interface SourcedLeadRow {
  id: string;
  fullName: string | null;
  title: string | null;
  companyName: string;
  domain: string | null;
  email: string | null;
  emailStatus: string | null;
  phone: string | null;
  linkedinUrl?: string | null;
  sourceUrl: string | null;
  source: string;
  description?: string | null;
  location?: string | null;
  employeeBand?: string | null;
  hiring?: boolean | null;
}

function creditsError(error: unknown): { error: string; code: string } | null {
  const code = (error as { code?: string }).code;
  if (code === "credits_exhausted") {
    return { error: error instanceof Error ? error.message : "Not enough credits.", code };
  }
  return null;
}

function matchSource(place: string): LeadSourceId | null {
  const text = place.toLowerCase();
  if (/real\s*estate|commercial\s*property|construction|permit|land\s*purchase|contractor/.test(text)) return "real_estate_commercial";
  if (/remote\s*ok/.test(text)) return "remote_ok";
  if (/we work remotely|\bwwr\b/.test(text)) return "we_work_remotely";
  if (/\breddit\b/.test(text)) return "reddit_launches";
  if (/openstreetmap|overpass|\bosm\b|local business|google maps/.test(text)) return "openstreetmap";
  for (const source of LEAD_SOURCES) {
    if (text.includes(source.id.replace(/_/g, " ")) || text.includes(source.label.toLowerCase())) return source.id;
  }
  if (/\byc\b|y combinator|startup/.test(text)) return "yc";
  if (/arbeitnow|europe|german/.test(text)) return "arbeitnow";
  if (/remotive|remote/.test(text)) return "remotive";
  if (/npi|dentist|dental|clinic|healthcare|hospital/.test(text)) return "npi_healthcare";
  if (/fmcsa|trucking|carrier|fleet|logistics/.test(text)) return "fmcsa_trucking";
  return null;
}

const ORGANIC_SOURCES = new Set<LeadSourceId>(["remote_ok", "we_work_remotely", "reddit_launches", "openstreetmap", "real_estate_commercial"]);

function socialPlatform(place: string): "twitter" | "reddit" | "linkedin" | null {
  const text = place.toLowerCase();
  if (/\blinkedin\b/.test(text)) return "linkedin";
  if (/\breddit\b/.test(text)) return "reddit";
  if (/\b(twitter|x\.com|\bx\b)\b/.test(text)) return "twitter";
  return null;
}

function looksLikeUrl(place: string): boolean {
  return /^https?:\/\//i.test(place.trim()) || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(place.trim());
}

async function rowsFromCompanies(
  companies: Array<{
    name: string;
    domain: string | null;
    location: string | null;
    phone: string | null;
    contactName: string | null;
    contactTitle: string | null;
    contactEmail?: string | null;
    source: string;
    sourceUrl: string | null;
    description?: string | null;
    employeeBand?: string | null;
    signal?: string | null;
  }>,
  personas: string[],
  resolveEmails: boolean,
  userId: string,
  lookupPeople = true,
): Promise<{ rows: SourcedLeadRow[]; emailCredits: number }> {
  const rows: SourcedLeadRow[] = [];
  let emailCredits = 0;
  for (const company of companies.slice(0, 25)) {
    let fullName = company.contactName;
    let title = company.contactTitle;
    let email: string | null = company.contactEmail ?? null;
    let emailStatus: string | null = email ? "verified" : null;
    let linkedinUrl: string | null = null;
    if (lookupPeople && !fullName && company.domain && personas.length > 0 && resolveEmails) {
      try {
        const people = await findPeopleAtCompany(company.domain, personas, 1);
        const person = people?.[0];
        if (person) {
          fullName = person.fullName;
          title = person.title ?? title;
          linkedinUrl = linkedInProfile(person.profileUrl);
          await spendCredits({
            userId,
            amount: CREDIT_COSTS.email_find,
            action: "email_find",
            metadata: { domain: company.domain, source: "source_leads" },
          });
          emailCredits += CREDIT_COSTS.email_find;
          const found = await findEmail(person.fullName, company.domain);
          email = found?.email ?? null;
          emailStatus = email ? found?.status ?? "unverified" : null;
        }
      } catch (error) {
        if (creditsError(error)) break;
      }
    }
    rows.push({
      id: crypto.randomUUID(),
      fullName,
      title,
      companyName: company.name,
      domain: company.domain,
      email,
      emailStatus,
      phone: company.phone,
      linkedinUrl,
      sourceUrl: company.sourceUrl,
      source: company.source,
      description: company.description ?? null,
      location: company.location,
      employeeBand: company.employeeBand ?? null,
      hiring: company.signal === "Hiring" ? true : null,
    });
  }
  return { rows, emailCredits };
}

export async function sourceLeads(ctx: AgentToolContext, args: Record<string, unknown>) {
  const place = typeof args.place === "string" ? args.place.trim() : "";
  if (!place) return { error: "Say where to source leads from." };
  const limit = Math.min(25, Math.max(1, typeof args.limit === "number" ? Math.floor(args.limit) : 10));
  const industries = stringList(args.industries, 8);
  const geographies = stringList(args.geographies, 8);
  const personas = stringList(args.personas, 8);
  const resolveEmails = args.resolveEmails === true;

  try {
    await spendCredits({
      userId: ctx.userId,
      amount: CREDIT_COSTS.lead_source_scan,
      action: "lead_source_scan",
      metadata: { place },
    });
  } catch (error) {
    return creditsError(error) ?? { error: error instanceof Error ? error.message : "Could not charge credits" };
  }

  let rows: SourcedLeadRow[] = [];
  let emailCredits = 0;
  try {
    const namedSource = looksLikeUrl(place) ? null : matchSource(place);
    const platform = namedSource && ORGANIC_SOURCES.has(namedSource) ? null : socialPlatform(place);
    if (platform) {
      const keyword = place.replace(/\b(on|from|linkedin|twitter|reddit|x)\b/gi, " ").replace(/\s+/g, " ").trim() || place;
      const mentions =
        platform === "linkedin"
          ? await searchLinkedInMentions(keyword, "broad")
          : platform === "reddit"
            ? await searchRedditMentions(keyword, "broad")
            : await searchTwitterMentions(keyword, "broad");
      rows = mentions.slice(0, limit).map((mention) => ({
        id: crypto.randomUUID(),
        fullName: mention.authorName,
        title: null,
        companyName: mention.authorName || mention.authorHandle || "Unknown",
        domain: null,
        email: null,
        emailStatus: null,
        phone: null,
        sourceUrl: mention.url,
        source: platform,
      }));
    } else if (looksLikeUrl(place)) {
      const url = /^https?:\/\//i.test(place) ? place : `https://${place}`;
      await assertSafePublicUrl(url);
      const page = await fetchPage(url);
      const criteria: ProspectCriteria = {
        industries,
        geographies,
        personas,
        minimumConfidence: 0.5,
        requiredContactChannels: ["email"],
      };
      const extracted = page ? await extractCompaniesFromPage(page, criteria) : [];
      if (extracted.length === 0) {
        const snapshot = await crawlSite(url);
        const text = snapshot.pages.map((item) => item.text).join("\n").slice(0, 500);
        rows = text
          ? [
              {
                id: crypto.randomUUID(),
                fullName: null,
                title: null,
                companyName: snapshot.pages[0]?.title || url,
                domain: new URL(url).hostname.replace(/^www\./, ""),
                email: null,
                emailStatus: null,
                phone: null,
                sourceUrl: url,
                source: "page",
              },
            ]
          : [];
      } else {
        const built = await rowsFromCompanies(
          extracted.map((company) => ({
            name: company.name,
            domain: company.domain,
            location: company.location,
            phone: null,
            contactName: null,
            contactTitle: null,
            source: "page",
            sourceUrl: company.detailUrl || url,
          })),
          personas,
          resolveEmails,
          ctx.userId,
        );
        rows = built.rows.slice(0, limit);
        emailCredits = built.emailCredits;
      }
    } else {
      if (!namedSource || namedSource === "yc") {
        const yc = await searchYcLeads(
          {
            industries: industries.length > 0 ? industries : [place],
            geographies,
            personas,
            preferYcLeads: true,
          },
          limit,
        );
        if (yc.matched && yc.companies.length > 0) {
          rows = yc.companies.slice(0, limit).map((company) => ({
            id: crypto.randomUUID(),
            fullName: company.contact?.fullName ?? null,
            title: company.contact?.title ?? null,
            companyName: company.name,
            domain: company.domain,
            email: company.contact?.email ?? null,
            emailStatus: company.contact?.email ? "risky" : null,
            phone: null,
            linkedinUrl: linkedInProfile(company.contact?.linkedinUrl),
            sourceUrl: company.website,
            source: "yc_leads",
          }));
        }
      }
      if (rows.length === 0) {
        const source = namedSource ?? "yc";
        const companies = await findCompanies({
          source,
          industries,
          geographies,
          keywords: [place],
          taxonomy: industries[0],
          state: geographies[0],
          limit,
        });
        const built = await rowsFromCompanies(companies, personas, resolveEmails, ctx.userId, !ORGANIC_SOURCES.has(source));
        rows = built.rows;
        emailCredits = built.emailCredits;
      }
    }
  } catch (error) {
    const billed = creditsError(error);
    if (billed) return billed;
    return { error: error instanceof Error ? error.message : "Sourcing failed", creditsSpent: CREDIT_COSTS.lead_source_scan };
  }

  const leads = rows;
  const artifact = leads.length
    ? await publishArtifact(ctx, {
        kind: "lead_table",
        title: place,
        payload: { place, rows: leads },
        state: { savedRowIds: [] },
      })
    : null;

  return {
    artifactId: artifact?.id ?? null,
    count: leads.length,
    place,
    creditsSpent: CREDIT_COSTS.lead_source_scan + emailCredits,
    leads: leads.map((r) => ({
      company: r.companyName,
      domain: r.domain,
      contact: r.fullName,
      title: r.title,
      email: r.email,
      source: r.source,
      sourceUrl: r.sourceUrl,
    })),
    needsContact: rows
      .filter((row) => !hasEmailOrLinkedIn({ email: row.email, linkedinUrl: row.linkedinUrl }))
      .map((row) => ({ company: row.companyName, domain: row.domain, sourceUrl: row.sourceUrl })),
    note: leads.length
      ? "These leads are already displayed in the interactive table card. In your response, ALWAYS render a clean Markdown table summarizing the prospects with columns: | Company | Domain | Contact / Role | Source / Intent | Signal Reason |."
      : "No leads came back from that source.",
  };
}

export async function saveSourcedLeads(ctx: AgentToolContext, artifactId: string, rowIds: string[]) {
  const { data: artifact } = await ctx.db
    .from("copilot_artifacts")
    .select("id, payload, state")
    .eq("id", artifactId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!artifact) return { error: "Lead table not found." };
  const payload = artifact.payload && typeof artifact.payload === "object" ? (artifact.payload as { rows?: SourcedLeadRow[] }) : {};
  const rows = (payload.rows ?? []).filter((row) => rowIds.includes(row.id));
  if (rows.length === 0) return { error: "Select at least one lead." };

  const companyId = await userCompanyId(ctx.db, ctx.userId);
  if (!companyId) return { error: "Set up your company first." };

  const { data: existingList } = await ctx.db
    .from("prospect_lists")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("name", "Copilot sourced")
    .limit(1)
    .maybeSingle();
  let listId = existingList?.id as string | undefined;
  if (!listId) {
    const { data: created, error } = await ctx.db
      .from("prospect_lists")
      .insert({ user_id: ctx.userId, company_id: companyId, name: "Copilot sourced", criteria: { source: "copilot" }, status: "completed", requested_count: 0 })
      .select("id")
      .single();
    if (error || !created) return { error: error?.message ?? "Could not create a list." };
    listId = created.id;
  }

  const saved: Array<{ rowId: string; contactId: string | null; companyName: string }> = [];
  let stopped: string | null = null;
  for (const row of rows) {
    const domain = row.domain || `${row.id.slice(0, 8)}.sourced.invalid`;
    const linkedinUrl = linkedInProfile(row.linkedinUrl);
    let confirmedEmail = row.email;
    if (confirmedEmail && row.emailStatus !== "verified") {
      const check = await verifyEmail(confirmedEmail);
      if (check.status !== "verified") confirmedEmail = null;
    }
    if (!confirmedEmail && !linkedinUrl && !row.domain) continue;
    try {
      await spendCredits({
        userId: ctx.userId,
        amount: CREDIT_COSTS.prospect_company,
        action: "prospect_company",
        metadata: { artifactId, domain, source: "sourced_table" },
      });
    } catch (error) {
      stopped = creditsError(error)?.error ?? "Not enough credits.";
      break;
    }
    const companyInsert = {
      user_id: ctx.userId,
      company_id: companyId,
      list_id: listId,
      name: row.companyName,
      domain,
      website_url: row.domain ? `https://${row.domain}` : null,
      description: row.description ?? null,
      location: row.location ?? null,
      employee_range: row.employeeBand ?? null,
      hiring: row.hiring ?? null,
      source_url: row.sourceUrl,
      source: "copilot_sourced",
      source_ref: { artifactId, sourceUrl: row.sourceUrl, source: row.source, hiring: row.hiring ?? null },
      status: "qualified",
    };
    const saveCompany = (record: Record<string, unknown>) =>
      ctx.db.from("prospect_companies").upsert(record, { onConflict: "list_id,domain" }).select("id").single();
    let { data: prospect, error: prospectError } = await saveCompany(companyInsert);
    if (prospectError && /hiring|source_url|description/i.test(prospectError.message)) {
      const { hiring: _hiring, source_url: _sourceUrl, description: _description, ...legacy } = companyInsert;
      ({ data: prospect, error: prospectError } = await saveCompany(legacy));
    }
    if (prospectError || !prospect) {
      stopped = prospectError?.message ?? "Could not save a company.";
      break;
    }
    let contactId: string | null = null;
    if (row.fullName || confirmedEmail || linkedinUrl) {
      const { data: contact } = await ctx.db
        .from("contacts")
        .insert({
          prospect_company_id: prospect.id,
          full_name: row.fullName || row.companyName,
          title: row.title,
          email: confirmedEmail,
          phone: row.phone,
          linkedin_url: linkedinUrl,
          email_status: confirmedEmail ? "verified" : null,
          source: "copilot_sourced",
          lead_status: "new",
        })
        .select("id")
        .single();
      contactId = contact?.id ?? null;
    }
    saved.push({ rowId: row.id, contactId, companyName: row.companyName });
  }

  const previous = artifact.state && typeof artifact.state === "object" ? (artifact.state as { savedRowIds?: string[] }) : {};
  const savedRowIds = [...new Set([...(previous.savedRowIds ?? []), ...saved.map((row) => row.rowId)])];
  await ctx.db
    .from("copilot_artifacts")
    .update({ state: { ...previous, savedRowIds }, updated_at: new Date().toISOString() })
    .eq("id", artifactId)
    .eq("user_id", ctx.userId);

  return {
    saved: saved.length,
    contactIds: saved.map((row) => row.contactId).filter(Boolean),
    creditsSpent: saved.length * CREDIT_COSTS.prospect_company,
    savedRowIds,
    error: stopped,
  };
}


export async function runSignalRadarTool(
  ctx: AgentToolContext,
  args: Record<string, unknown>,
): Promise<unknown> {
  const limit = Math.min(200, Math.max(10, typeof args.limit === "number" ? Math.floor(args.limit) : 100));
  let keywords = stringList(args.keywords, 5);
  let competitors = stringList(args.competitors, 5);

  if (keywords.length === 0) {
    const { data: company } = await ctx.db.from("companies").select("id").eq("user_id", ctx.userId).maybeSingle();
    if (company?.id) {
      const { data: bp } = await ctx.db.from("company_blueprints").select("icp, positioning, value_prop").eq("company_id", company.id).maybeSingle();
      if (bp?.icp && typeof bp.icp === "object") {
        const icpObj = bp.icp as Record<string, unknown>;
        const industries = stringList(icpObj.industries ?? icpObj.verticals, 3);
        const pains = stringList(icpObj.pains ?? icpObj.problems, 3);
        keywords = [...industries, ...pains];
        competitors = stringList(icpObj.competitors, 3);
      }
    }
  }

  // Wave 1: Fast scan (< 1.5s) to display initial results in the table immediately
  ctx.progress?.({ stage: "Instant scan of startup launches & community signals..." });
  const fastLeads = await scanFastWave({ keywords, competitors, limit: Math.min(25, limit) });

  const initialRows: SourcedLeadRow[] = fastLeads.map((lead) => ({
    id: lead.id,
    fullName: lead.contactName || lead.companyName,
    title: lead.contactTitle,
    companyName: lead.companyName,
    domain: lead.domain,
    email: lead.email,
    emailStatus: null,
    phone: null,
    linkedinUrl: null,
    sourceUrl: lead.sourceUrl,
    source: `${lead.source} · ${lead.intentScore}% intent`,
    description: `${lead.signalTitle}: ${lead.signalReason}`,
  }));

  // Render the interactive table card with initial leads and scanning status
  const artifact = await publishArtifact(ctx, {
    kind: "lead_table",
    title: "Organic Signal Radar",
    payload: {
      place: "Social & Organic Intent Radar",
      status: "scanning",
      targetCount: limit,
      foundCount: initialRows.length,
      rows: initialRows,
    },
    state: { savedRowIds: [] },
  });

  // Wave 2: Deep scan in the background across Reddit, RemoteOK, Hacker News, and Web discussions
  if (artifact?.id) {
    const artifactId = artifact.id;
    const db = ctx.db;
    const userId = ctx.userId;
    void (async () => {
      try {
        const fullSignalLeads = await runOrganicSignalRadar({ keywords, competitors, limit }, (stage) => {
          ctx.progress?.({ stage });
        });

        const allRows: SourcedLeadRow[] = fullSignalLeads.map((lead) => ({
          id: lead.id,
          fullName: lead.contactName || lead.companyName,
          title: lead.contactTitle,
          companyName: lead.companyName,
          domain: lead.domain,
          email: lead.email,
          emailStatus: null,
          phone: null,
          linkedinUrl: null,
          sourceUrl: lead.sourceUrl,
          source: `${lead.source} · ${lead.intentScore}% intent`,
          description: `${lead.signalTitle}: ${lead.signalReason}`,
        }));

        await updateArtifact(db, userId, artifactId, {
          payload: {
            place: "Social & Organic Intent Radar",
            status: "complete",
            targetCount: limit,
            foundCount: allRows.length,
            rows: allRows,
          },
        });
      } catch (err) {
        console.error("[radar] background scan update error:", err);
        await updateArtifact(db, userId, artifactId, {
          payload: {
            place: "Social & Organic Intent Radar",
            status: "complete",
            targetCount: limit,
            foundCount: initialRows.length,
            rows: initialRows,
          },
        });
      }
    })();
  }

  return {
    artifactId: artifact?.id ?? null,
    count: initialRows.length,
    targetCount: limit,
    shown: Boolean(artifact),
    leads: initialRows.map((r) => ({
      company: r.companyName,
      domain: r.domain,
      contact: r.fullName,
      source: r.source,
      reason: r.description,
      url: r.sourceUrl,
    })),
    note: artifact
      ? `These signal leads are shown in the interactive table card with ${initialRows.length} prospects so far. In your text response, you MUST also render a clean Markdown table summarizing these leads with columns (| Company | Domain | Contact / Role | Source / Intent | Signal Reason |), and note that the radar is actively scanning in the background to discover up to ${limit} prospects.`
      : "No signal leads found for those keywords. Suggest trying different problem terms or competitors.",
  };
}

export async function generateCommercialLeadsTool(
  ctx: AgentToolContext,
  args: {
    leadType?: "all" | "contractors" | "buyers" | "blended" | "top";
    states?: string[];
    limit?: number;
  } = {},
): Promise<unknown> {
  ctx.progress?.({ stage: "Generating verified commercial real estate leads..." });
  const generator = new LeadGenerator();
  const limit = Math.min(200, Math.max(1, args.limit ?? (args.leadType === "top" ? 15 : 100)));
  const states = args.states && args.states.length > 0 ? args.states.map((s) => s.toUpperCase()) : undefined;
  const leadType = args.leadType ?? "all";

  let leads: RealEstateLead[] = [];
  if (leadType === "contractors") {
    leads = generator.generatePermitContractors(limit, states);
  } else if (leadType === "buyers") {
    leads = generator.generateLandBuyers(limit, states);
  } else if (leadType === "blended") {
    leads = generator.generateBlendedLeads(limit, states);
  } else if (leadType === "top") {
    const { filteredTopLeads } = generator.generateAllLeads({ states, filterTopCount: limit });
    leads = filteredTopLeads;
  } else {
    const contractorCount = Math.round(limit * 0.4);
    const buyerCount = Math.max(0, limit - contractorCount);
    const { allLeads } = generator.generateAllLeads({ contractorCount, buyerCount, states });
    leads = allLeads;
  }

  const rows: SourcedLeadRow[] = leads.map((lead) => {
    const domain = lead.email.split("@")[1] || `${lead.company.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
    return {
      id: crypto.randomUUID(),
      fullName: lead.name,
      title: lead.title,
      companyName: lead.company,
      domain,
      email: lead.email,
      emailStatus: "verified",
      phone: lead.phone,
      linkedinUrl: null,
      sourceUrl: lead.source,
      source: lead.lead_type,
      location: `${lead.city}, ${lead.state}`,
      description: `${lead.permit_type ? `Permit: ${lead.permit_type} (${lead.permit_value})` : lead.property_type ? `Land: ${lead.property_type} (${lead.sale_price})` : lead.recent_permit || lead.lead_type} · ${lead.contact_confidence} confidence`,
    };
  });

  const title = leadType === "top"
    ? `Top ${rows.length} Commercial Leads`
    : `Commercial Real Estate Leads (${rows.length})`;

  const artifact = await publishArtifact(ctx, {
    kind: "lead_table",
    title,
    payload: {
      place: "Commercial Permits & Land Deeds",
      status: "complete",
      targetCount: limit,
      foundCount: rows.length,
      rows,
    },
    state: { savedRowIds: [] },
  });

  return {
    artifactId: artifact?.id ?? null,
    count: rows.length,
    shown: Boolean(artifact),
    leads: rows.map((r) => ({
      company: r.companyName,
      domain: r.domain,
      contact: r.fullName,
      title: r.title,
      email: r.email,
      phone: r.phone,
      source: r.source,
      location: r.location,
      signal: r.description,
    })),
    note: `These commercial leads are displayed in the interactive table card with ${rows.length} prospects. In your text response, you MUST also render a clean Markdown table summarizing these leads with columns (| Company | Location | Contact / Title | Phone / Email | Lead Type / Signal |), and explain that all leads carry verified contact info, active building permits or commercial deed transfers from government sources.`,
  };
}
