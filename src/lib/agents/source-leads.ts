import { spendCredits } from "@/lib/billing/credits";
import { CREDIT_COSTS } from "@/lib/billing/plans";
import { searchLinkedInMentions } from "@/lib/market/linkedin";
import { searchRedditMentions } from "@/lib/market/reddit";
import { searchTwitterMentions } from "@/lib/market/twitter";
import { findEmail, findPeopleAtCompany } from "@/lib/prospecting/icypeas";
import { findCompanies, LEAD_SOURCES, type LeadSourceId } from "@/lib/prospecting/sources";
import { assertSafePublicUrl, crawlSite } from "@/lib/scraper/crawl";
import { extractCompaniesFromPage } from "@/lib/prospecting/agent/shared";
import { fetchPage } from "@/lib/scraper/fetch-page";
import type { ProspectCriteria } from "@/lib/prospecting/types";
import { publishArtifact } from "@/lib/copilot/artifacts";
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
  sourceUrl: string | null;
  source: string;
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
    source: string;
    sourceUrl: string | null;
  }>,
  personas: string[],
  resolveEmails: boolean,
  userId: string,
): Promise<{ rows: SourcedLeadRow[]; emailCredits: number }> {
  const rows: SourcedLeadRow[] = [];
  let emailCredits = 0;
  for (const company of companies.slice(0, 25)) {
    let fullName = company.contactName;
    let title = company.contactTitle;
    let email: string | null = null;
    let emailStatus: string | null = null;
    if (!fullName && company.domain && personas.length > 0 && resolveEmails) {
      try {
        const people = await findPeopleAtCompany(company.domain, personas, 1);
        const person = people?.[0];
        if (person) {
          fullName = person.fullName;
          title = person.title ?? title;
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
      sourceUrl: company.sourceUrl,
      source: company.source,
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
    const platform = socialPlatform(place);
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
      const source = matchSource(place) ?? "yc";
      const companies = await findCompanies({
        source,
        industries,
        geographies,
        keywords: [place],
        taxonomy: industries[0],
        state: geographies[0],
        limit,
      });
      const built = await rowsFromCompanies(companies, personas, resolveEmails, ctx.userId);
      rows = built.rows;
      emailCredits = built.emailCredits;
    }
  } catch (error) {
    const billed = creditsError(error);
    if (billed) return billed;
    return { error: error instanceof Error ? error.message : "Sourcing failed", creditsSpent: CREDIT_COSTS.lead_source_scan };
  }

  const artifact = await publishArtifact(ctx, {
    kind: "lead_table",
    title: place,
    payload: { place, rows },
    state: { savedRowIds: [] },
  });

  return {
    artifactId: artifact?.id ?? null,
    count: rows.length,
    place,
    creditsSpent: CREDIT_COSTS.lead_source_scan + emailCredits,
    note: rows.length
      ? "Lead table is in the chat. Saving a company into Prospects costs 3 credits each."
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
      .insert({ user_id: ctx.userId, company_id: companyId, name: "Copilot sourced", criteria: {}, status: "completed", requested_count: 0 })
      .select("id")
      .single();
    if (error || !created) return { error: error?.message ?? "Could not create a list." };
    listId = created.id;
  }

  const saved: Array<{ rowId: string; contactId: string | null; companyName: string }> = [];
  let stopped: string | null = null;
  for (const row of rows) {
    const domain = row.domain || `${row.id.slice(0, 8)}.sourced.invalid`;
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
    const { data: prospect, error: prospectError } = await ctx.db
      .from("prospect_companies")
      .upsert(
        {
          user_id: ctx.userId,
          company_id: companyId,
          list_id: listId,
          name: row.companyName,
          domain,
          website_url: row.domain ? `https://${row.domain}` : null,
          source: "copilot_sourced",
          source_ref: { artifactId, sourceUrl: row.sourceUrl, source: row.source },
          status: "qualified",
        },
        { onConflict: "list_id,domain" },
      )
      .select("id")
      .single();
    if (prospectError || !prospect) {
      stopped = prospectError?.message ?? "Could not save a company.";
      break;
    }
    let contactId: string | null = null;
    if (row.fullName || row.email) {
      const { data: contact } = await ctx.db
        .from("contacts")
        .insert({
          prospect_company_id: prospect.id,
          full_name: row.fullName || row.companyName,
          title: row.title,
          email: row.email,
          phone: row.phone,
          email_status: row.email ? row.emailStatus || "unverified" : null,
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
