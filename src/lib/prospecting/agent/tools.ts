/**
 * Tool declarations + executor for the directory scraping agent.
 *
 * The agent (Gemini function-calling loop in run.ts) uses these to search for
 * directories, open pages, extract companies/people, qualify, resolve emails,
 * and save leads. All fetching goes through the hybrid fetcher (headless
 * escalation) and every page is snapshotted to our DB.
 */

import type { AiToolDeclaration } from "@/lib/ai/openai";
import { webSearchResults } from "@/lib/search/web-search";
import { LEAD_SOURCES, findAtsBoard, findCompanies, matchRoles, type LeadSourceId } from "../sources";
import { findCompanyLeads, findPeopleAtCompany, isEmailFinderConfigured, translateIcypeasGeography } from "../icypeas";
import { matchIcypeasIndustries } from "../icypeas-industries";
import { fetchPage, type FetchedPage } from "@/lib/scraper/fetch-page";
import type { CandidateCompany, CandidateContact, ContactStatus, ExtractedPerson } from "../types";
import { isExcludedHost } from "./directories";
import type { AgentRunContext } from "./context";
import { persistLead, saveSnapshot } from "./persist";
import {
  buildContactsForCompany,
  extractCompaniesFromPage,
  extractPeopleFromPage,
  normalizeDomain,
  qualifyPerson,
  resolveEmail,
} from "./shared";

export const AGENT_TOOL_DECLARATIONS: AiToolDeclaration[] = [
  {
    name: "find_leads",
    description:
      "THE MAIN TOOL. USE THIS FIRST, AND USUALLY ONLY THIS. Searches a paid contact database for companies matching the ICP AND returns a real decision maker at each one in the SAME call — a name, a job title, a LinkedIn URL, and enough company detail (domain, size, location) to save a lead immediately. There is no separate 'find companies' or 'find people' step needed after this: every row it returns already has both.\n\nAfter calling this, for each row: qualify the person, resolve_email, then save_lead. Do not call find_companies, find_people, extract_people, web_search, or open_page unless this tool is unavailable (not configured) or returns nothing after two tries with different wording.",
    parameters: {
      type: "object",
      properties: {
        industries: {
          type: "array",
          items: { type: "string" },
          description: "Industry/vertical terms from the ICP, in plain English (e.g. \"B2B SaaS\", \"fintech\"). Do not worry about exact wording — they are mapped onto the provider's vocabulary automatically.",
        },
        geographies: { type: "array", items: { type: "string" }, description: "Locations from the ICP, e.g. \"United States\", \"North America\", \"Germany\"." },
        titles: {
          type: "array",
          items: { type: "string" },
          description: "Target job titles/personas to find a decision maker for, e.g. [\"Founder\",\"Head of Sales\",\"VP Sales\"]. Required.",
        },
        minHeadcount: { type: "number", description: "Minimum company employee count" },
        maxHeadcount: { type: "number", description: "Maximum company employee count" },
        limit: { type: "number", description: "Max company+person rows to return (default 25, one person per company)" },
      },
      required: ["titles"],
    },
  },
  {
    name: "find_companies",
    description:
      "FALLBACK ONLY — use find_leads first. Pull companies from a structured, official data source instead of scraping directory pages. Returns clean rows with name, domain, location and — for the registry sources — a named decision maker and phone number.\n\nSources:\n" +
      LEAD_SOURCES.map((s) => `- "${s.id}" (${s.archetype}): ${s.bestFor}${s.namesAHuman ? " NAMES A HUMAN DIRECTLY." : ""}`).join("\n"),
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", enum: [...LEAD_SOURCES.map((s) => s.id)], description: "Which source to pull from" },
        industries: { type: "array", items: { type: "string" }, description: "Industry/vertical terms to filter on" },
        geographies: { type: "array", items: { type: "string" }, description: "Locations to filter on" },
        keywords: { type: "array", items: { type: "string" }, description: "Free-text terms matched against the company pitch" },
        taxonomy: {
          type: "string",
          description: 'npi_healthcare only: the provider type, e.g. "dentist", "physical therapy", "home health", "pharmacy".',
        },
        state: { type: "string", description: "Two-letter US state code, for npi_healthcare and fmcsa_trucking" },
        hiringOnly: { type: "boolean", description: "yc only: keep only companies currently marked as hiring" },
        minTeamSize: { type: "number" },
        maxTeamSize: { type: "number" },
        limit: { type: "number", description: "Max rows to return (default 50)" },
      },
      required: ["source"],
    },
  },
  {
    name: "check_hiring_signal",
    description:
      "OPTIONAL, LOW PRIORITY. Finding leads comes first — only call this once you already have saved leads and have spare budget left. Looks up a company's public job board (Greenhouse, Ashby, Lever or Workable) by domain and reports open roles with how long each has been open, as extra context for a lead you already found. A role open more than 30 days is a useful buying signal, but its absence is never a reason to skip a company. Returns no board for roughly half of companies; that is normal, not an error.",
    parameters: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Company domain, e.g. acme.com" },
        roleKeywords: {
          type: "array",
          items: { type: "string" },
          description: 'Title fragments that indicate the buying trigger, e.g. ["sales", "sdr", "revenue", "growth"]',
        },
      },
      required: ["domain"],
    },
  },
  {
    name: "web_search",
    description:
      "Search the public web (Google) for directories, association/chamber member lists, or company listing pages relevant to the ICP. Returns candidate URLs to open. Use this to FIND directories, not to find individual companies.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
  {
    name: "open_page",
    description:
      "Fetch and read a public web page (headless browser used automatically for JS-heavy pages). Returns cleaned text and on-page links (useful for pagination and company detail links). Every page is saved to our database.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
        pageKind: {
          type: "string",
          enum: ["directory_listing", "company_detail", "company_site", "search", "unknown"],
          description: "Your best guess at what this page is, for our records.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "extract_companies",
    description:
      "Extract the list of companies from a directory/listing page URL (opens it if needed). Returns [{name, domain, detailUrl, location, industry}].",
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "find_people",
    description:
      "PREFERRED way to find decision makers. Looks up who works at a company by domain, using a paid contact database — no page fetching. Returns real names, job titles and LinkedIn profile URLs. Use this BEFORE extract_people: company websites usually do not publish their team, so extracting from a page normally returns nobody.",
    parameters: {
      type: "object",
      properties: {
        domain: { type: "string", description: "Company domain, e.g. acme.com" },
        titles: {
          type: "array",
          items: { type: "string" },
          description: 'Job-title fragments to match, e.g. ["Founder","Head of Sales"]. Leave empty to return anyone.',
        },
        limit: { type: "number", description: "Max people to return (default 10)" },
      },
      required: ["domain"],
    },
  },
  {
    name: "extract_people",
    description:
      "Extract named people (decision makers) from a company website or detail page URL. Returns people with any on-page email/phone/profile. Opens the page if needed.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
        targetTitles: { type: "array", items: { type: "string" }, description: "Preferred titles/personas" },
      },
      required: ["url"],
    },
  },
  {
    name: "qualify",
    description:
      "Judge whether a person at a company fits the ICP. Returns {fit, reason}. Call before saving a lead.",
    parameters: {
      type: "object",
      properties: {
        fullName: { type: "string" },
        title: { type: "string" },
        location: { type: "string" },
        companyName: { type: "string" },
        companyDomain: { type: "string" },
        companyIndustry: { type: "string" },
        companyLocation: { type: "string" },
      },
      required: ["fullName", "companyName", "companyDomain"],
    },
  },
  {
    name: "resolve_email",
    description:
      "Resolve and verify a work email for a person at a domain (uses on-page email if given, else guesses common patterns and verifies). Returns {email, status}. status verified/accept_all are usable.",
    parameters: {
      type: "object",
      properties: {
        fullName: { type: "string" },
        domain: { type: "string" },
        knownEmail: { type: "string", description: "An email already seen on the page, if any" },
      },
      required: ["fullName", "domain"],
    },
  },
  {
    name: "save_lead",
    description:
      "Persist one company and its qualified contacts to the user's prospect list and our database. Only include contacts you have qualified and whose email you resolved (status verified/accept_all) or that have a phone. Returns {saved, contactCount}.",
    parameters: {
      type: "object",
      properties: {
        company: {
          type: "object",
          properties: {
            name: { type: "string" },
            domain: { type: "string" },
            websiteUrl: { type: "string" },
            industry: { type: "string" },
            location: { type: "string" },
            directoryUrl: { type: "string", description: "The directory page this company came from, if any" },
          },
          required: ["name", "domain"],
        },
        contacts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              fullName: { type: "string" },
              title: { type: "string" },
              email: { type: "string" },
              emailStatus: { type: "string", enum: ["verified", "accept_all", "risky", "invalid", "observed"] },
              phone: { type: "string" },
              linkedinUrl: { type: "string" },
              qualifyReason: { type: "string" },
              sourceUrl: { type: "string" },
            },
            required: ["fullName"],
          },
        },
      },
      required: ["company", "contacts"],
    },
  },
];

/**
 * Real search, via src/lib/search/web-search.ts.
 *
 * This used to ask the configured AI provider for a JSON array of result
 * URLs with a provider search tool enabled. On Vertex (the default provider)
 * that returned fabricated URLs — grounding supplied zero sources and the
 * model answered from memory, so every link 404'd and the agent burned its
 * whole step budget fetching dead pages and saved nothing. Search now goes
 * through a real search engine and only the URLs it actually returns are
 * handed to the agent.
 *
 * A search-backend failure is rethrown rather than swallowed into an empty
 * array, so the run reports "search is broken" instead of "no leads found".
 */
async function webSearch(query: string): Promise<Array<{ url: string; title: string }>> {
  const results = await webSearchResults(
    `${query} — public business directory, industry association member list, chamber of commerce, or company listing page`,
    10
  );

  const out: Array<{ url: string; title: string }> = [];
  for (const result of results) {
    try {
      if (isExcludedHost(new URL(result.url).hostname)) continue;
    } catch {
      continue;
    }
    out.push({ url: result.url.slice(0, 1000), title: result.title.slice(0, 200) });
    if (out.length >= 10) break;
  }
  return out;
}

// ── fetch with cache + budget ────────────────────────────────────────────
async function fetchWithCache(
  ctx: AgentRunContext,
  url: string,
  pageKind: "directory_listing" | "company_detail" | "company_site" | "search" | "unknown"
): Promise<FetchedPage | { error: string }> {
  const cached = ctx.pageCache.get(url);
  if (cached) return cached;
  try {
    if (isExcludedHost(new URL(url).hostname)) {
      return { error: "host is excluded (social network / data broker / not a permitted source)" };
    }
  } catch {
    return { error: "invalid URL" };
  }
  if (ctx.counters.pagesFetched >= ctx.budget.maxPages) {
    return { error: "page budget reached; stop fetching and save what you have" };
  }
  const page = await fetchPage(url);
  ctx.counters.pagesFetched += 1;
  if (!page) return { error: "could not fetch (blocked by robots, unsafe URL, or unreachable)" };
  ctx.pageCache.set(url, page);
  ctx.pageCache.set(page.finalUrl, page);
  await saveSnapshot(ctx, page, pageKind);
  return page;
}

function compactLinks(page: FetchedPage): string[] {
  const out: string[] = [];
  for (const link of page.links) {
    try {
      if (!isExcludedHost(new URL(link).hostname)) out.push(link);
    } catch {
      /* skip */
    }
    if (out.length >= 60) break;
  }
  return out;
}

export async function runAgentTool(
  ctx: AgentRunContext,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case "find_leads": {
      if (!isEmailFinderConfigured()) {
        return {
          leads: [],
          error: "The contact database is not configured (ICYPEAS_API_KEY is unset). Use find_companies instead.",
        };
      }

      const titles = Array.isArray(args.titles) ? args.titles.map(String) : ctx.criteria.personas ?? [];
      if (titles.length === 0) {
        return { leads: [], error: "titles is required and was empty — pass at least one target job title." };
      }

      const industryWords = Array.isArray(args.industries) ? args.industries.map(String) : ctx.criteria.industries;
      const industries = matchIcypeasIndustries(industryWords);
      const geographies = translateIcypeasGeography(
        Array.isArray(args.geographies) ? args.geographies.map(String) : ctx.criteria.geographies
      );

      const rawLeads = await findCompanyLeads({
        industries,
        geographies,
        titles,
        minHeadcount: typeof args.minHeadcount === "number" ? args.minHeadcount : undefined,
        maxHeadcount: typeof args.maxHeadcount === "number" ? args.maxHeadcount : undefined,
        limit: typeof args.limit === "number" ? args.limit : 25,
      });

      if (rawLeads === null) {
        return { leads: [], error: "The contact-database lookup failed. Try find_companies instead." };
      }

      // Every lead needs a usable domain to reach qualify/resolve_email/
      // save_lead — a company the provider named but gave no website for
      // cannot be saved (the schema requires a domain), so it is dropped
      // here rather than being handed to the model as something to act on.
      const leads = rawLeads.flatMap((lead) => {
        const domain = lead.companyWebsite ? normalizeDomain(lead.companyWebsite) : null;
        if (!domain) return [];
        return [
          {
            fullName: lead.person.fullName,
            title: lead.person.title,
            linkedinUrl: lead.person.profileUrl,
            companyName: lead.companyName,
            companyDomain: domain,
            companySize: lead.companySize,
            companyLocation: lead.companyLocation,
          },
        ];
      });

      if (leads.length === 0) {
        return {
          leads: [],
          note:
            rawLeads.length > 0
              ? "The provider found people but no usable company website among them. Try different titles or broaden the ICP."
              : "Nobody matched. Try broader industries/geographies, or fewer/different titles — do not repeat the same call unchanged.",
        };
      }

      return {
        count: leads.length,
        leads,
        note: "Each row is a real, already-matched decision maker. For each: qualify, resolve_email, save_lead. No page fetching needed.",
      };
    }

    case "find_companies": {
      let rows: Awaited<ReturnType<typeof findCompanies>>;
      try {
        rows = await findCompanies({
        source: String(args.source ?? "") as LeadSourceId,
        industries: Array.isArray(args.industries) ? args.industries.map(String) : undefined,
        geographies: Array.isArray(args.geographies) ? args.geographies.map(String) : undefined,
        keywords: Array.isArray(args.keywords) ? args.keywords.map(String) : undefined,
        taxonomy: typeof args.taxonomy === "string" ? args.taxonomy : undefined,
        state: typeof args.state === "string" ? args.state : undefined,
        hiringOnly: typeof args.hiringOnly === "boolean" ? args.hiringOnly : undefined,
        minTeamSize: typeof args.minTeamSize === "number" ? args.minTeamSize : undefined,
        maxTeamSize: typeof args.maxTeamSize === "number" ? args.maxTeamSize : undefined,
        limit: typeof args.limit === "number" ? args.limit : 50,
        });
      } catch (error) {
        // A source that could not be reached is not a source that found
        // nothing. Saying so stops the agent concluding the ICP is empty and
        // wandering off to scrape directory pages instead.
        const message = error instanceof Error ? error.message : "the source could not be reached";
        console.error(`[agent] find_companies failed: ${message}`);
        return {
          count: 0,
          companies: [],
          error: `${message}. This is a source outage, not an empty result — retry this same call once, then try a different source.`,
        };
      }

      const withContact = rows.filter((r) => r.contactName).length;
      const withoutDomain = rows.filter((r) => !r.domain).length;
      const notes: string[] = [];
      notes.push(
        withContact > 0
          ? `${withContact} of these already name a decision maker — use that person, do not go looking for someone else.`
          : "None of these name a person; resolve contacts only for companies that pass qualification."
      );
      if (withoutDomain > 0) {
        // Registries carry no website, and save_lead needs a domain. One
        // search each is affordable; two is not, and re-searching the same
        // company is what exhausted the budget before anything got saved.
        notes.push(
          `${withoutDomain} have no website. Run ONE web_search per company to find it. If that search does not clearly show the company's own site, skip that company and move to the next one — never search twice for the same company.`
        );
      }
      return { count: rows.length, namedContacts: withContact, missingDomain: withoutDomain, note: notes.join(" "), companies: rows };
    }

    case "check_hiring_signal": {
      const domain = String(args.domain ?? "").trim();
      if (!domain) return { error: "domain is required" };
      const board = await findAtsBoard(domain);
      if (!board) return { domain, board: null, note: "No public job board found for this domain." };

      const keywords = Array.isArray(args.roleKeywords) ? args.roleKeywords.map(String) : [];
      const matched = keywords.length > 0 ? matchRoles(board, keywords) : [];
      const stale = matched.filter((r) => (r.ageDays ?? 0) > 30);
      return {
        domain,
        provider: board.provider,
        totalOpenRoles: board.roles.length,
        matchingRoles: matched.slice(0, 10),
        staleMatchingRoles: stale.length,
        note: stale.length > 0
          ? `${stale.length} matching role(s) open more than 30 days — strong buying signal.`
          : matched.length > 0
            ? "Matching roles found, all recently posted."
            : "No roles matching those keywords.",
      };
    }

    case "web_search": {
      const results = await webSearch(String(args.query ?? ""));
      return { results };
    }

    case "find_people": {
      const domain = String(args.domain ?? "").trim();
      if (!domain) return { error: "domain is required" };
      if (!isEmailFinderConfigured()) {
        return { people: [], error: "The contact database is not configured (ICYPEAS_API_KEY is unset)." };
      }

      const titles = Array.isArray(args.titles) ? args.titles.map(String) : (ctx.criteria.personas ?? []);
      const people = await findPeopleAtCompany(domain, titles, typeof args.limit === "number" ? args.limit : 10);

      // null means the lookup failed; [] means it ran and nobody matched.
      // Reporting both as "no people" is what let failures pass as ordinary
      // empty results and sent the agent off scraping instead.
      if (people === null) {
        return { domain, people: [], error: "The contact-database lookup failed for this domain." };
      }
      if (people.length === 0) {
        return {
          domain,
          people: [],
          note:
            titles.length > 0
              ? "Nobody at this domain matches those titles. Retry once with an empty titles list before giving up."
              : "The contact database has nobody at this domain. Move on to the next company.",
        };
      }

      return {
        domain,
        count: people.length,
        people: people.map((p) => ({ fullName: p.fullName, title: p.title, location: p.location, linkedinUrl: p.profileUrl })),
        note: "These are real people. Qualify the best fit, then resolve_email and save_lead. Do not open pages looking for others.",
      };
    }

    case "open_page": {
      const url = String(args.url ?? "");
      const kind = (args.pageKind as "directory_listing" | "company_detail" | "company_site" | "search" | "unknown") ?? "unknown";
      const page = await fetchWithCache(ctx, url, kind);
      if ("error" in page) return page;
      return {
        url: page.finalUrl,
        status: page.status,
        title: page.title,
        rendered: page.rendered,
        text: page.text.slice(0, 6_000),
        links: compactLinks(page),
      };
    }

    case "extract_companies": {
      const url = String(args.url ?? "");
      const page = await fetchWithCache(ctx, url, "directory_listing");
      if ("error" in page) return page;
      const companies = await extractCompaniesFromPage(page, ctx.criteria);
      const directoryHost = (() => {
        try {
          return new URL(page.finalUrl).hostname.replace(/^www\./, "");
        } catch {
          return null;
        }
      })();
      return { directoryUrl: page.finalUrl, directoryHost, companies };
    }

    case "extract_people": {
      const url = String(args.url ?? "");
      const targetTitles = Array.isArray(args.targetTitles) ? (args.targetTitles as string[]) : ctx.criteria.personas ?? [];
      const page = await fetchWithCache(ctx, url, "company_detail");
      if ("error" in page) return page;
      const people = await extractPeopleFromPage(page, targetTitles);

      // Explain an empty result rather than returning a bare []. Most company
      // sites never publish their team, and a silent empty list reads as
      // "this company has nobody", sending the agent to scrape another site
      // instead of using the contact database that does know.
      if (people.length === 0) {
        return {
          url: page.finalUrl,
          people: [],
          reason:
            page.text.trim().length < 400
              ? "This page returned almost no readable text (rendered client-side, or blocked)."
              : "This page does not name anyone.",
          note: isEmailFinderConfigured()
            ? "Use find_people with this company's domain instead — it does not depend on the site publishing a team page."
            : "No contact database is configured, so people can only come from page text. Move on.",
        };
      }

      return {
        url: page.finalUrl,
        people: people.map((p) => ({
          fullName: p.fullName,
          title: p.title,
          location: p.location,
          email: p.email,
          phone: p.phone,
          profileUrl: p.profileUrl,
          sourceUrl: p.sourceUrl,
        })),
      };
    }

    case "qualify": {
      const verdict = await qualifyPerson(
        {
          fullName: String(args.fullName ?? ""),
          title: (args.title as string) ?? null,
          location: (args.location as string) ?? null,
        },
        {
          name: String(args.companyName ?? ""),
          domain: String(args.companyDomain ?? ""),
          industry: (args.companyIndustry as string) ?? null,
          location: (args.companyLocation as string) ?? null,
        },
        ctx.criteria
      );
      return verdict;
    }

    case "resolve_email": {
      const domain = normalizeDomain(String(args.domain ?? "")) ?? String(args.domain ?? "");
      const person: ExtractedPerson = {
        fullName: String(args.fullName ?? ""),
        normalizedName: String(args.fullName ?? "")
          .normalize("NFKD")
          .replace(/\p{M}/gu, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, " ")
          .trim(),
        title: null,
        location: null,
        sourceUrl: "",
        email: typeof args.knownEmail === "string" ? args.knownEmail.toLowerCase() : null,
        phone: null,
        profileUrl: null,
        evidence: { url: "", excerpt: "", observedAt: new Date().toISOString() },
      };
      const resolved = await resolveEmail(person, domain, null);
      return { email: resolved.email, status: resolved.status };
    }

    case "save_lead": {
      const c = (args.company ?? {}) as Record<string, unknown>;
      const domain = normalizeDomain(String(c.domain ?? ""));
      if (!domain) return { saved: false, reason: "invalid or excluded domain" };
      const directoryUrl = typeof c.directoryUrl === "string" ? c.directoryUrl : "";
      let directoryHost: string | null = null;
      try {
        directoryHost = directoryUrl ? new URL(directoryUrl).hostname.replace(/^www\./, "") : null;
      } catch {
        directoryHost = null;
      }

      const company: CandidateCompany = {
        name: String(c.name ?? domain).slice(0, 160),
        domain,
        websiteUrl: typeof c.websiteUrl === "string" && c.websiteUrl ? c.websiteUrl : `https://${domain}`,
        industry: typeof c.industry === "string" ? c.industry.slice(0, 160) : ctx.criteria.industries[0] ?? null,
        employeeRange: ctx.criteria.companySizeRange ?? null,
        location: typeof c.location === "string" ? c.location.slice(0, 160) : ctx.criteria.geographies[0] ?? null,
        icpFitScore: 0.8,
        dataConfidence: 0.7,
        source: "directory_agent",
        sourceRef: { discovery: "directory_agent", directoryUrl, directoryHost },
      };

      const now = new Date().toISOString();
      const rawContacts = Array.isArray(args.contacts) ? (args.contacts as Record<string, unknown>[]) : [];
      const contacts: CandidateContact[] = rawContacts
        .map((rc): CandidateContact | null => {
          const fullName = String(rc.fullName ?? "").trim();
          if (!fullName) return null;
          const email = typeof rc.email === "string" ? rc.email.toLowerCase() : null;
          const status = (typeof rc.emailStatus === "string" ? rc.emailStatus : email ? "observed" : "risky") as ContactStatus;
          const phone = typeof rc.phone === "string" ? rc.phone : null;
          const reason = typeof rc.qualifyReason === "string" ? rc.qualifyReason : "";
          const sourceUrl = typeof rc.sourceUrl === "string" ? rc.sourceUrl : company.websiteUrl;
          return {
            fullName: fullName.slice(0, 120),
            normalizedName: fullName.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
            title: typeof rc.title === "string" ? rc.title.slice(0, 160) : null,
            location: null,
            email,
            emailStatus: status,
            phone,
            linkedinUrl: typeof rc.linkedinUrl === "string" ? rc.linkedinUrl : null,
            origin: "inferred",
            confidence: status === "verified" ? 0.85 : 0.65,
            evidence: [{ url: sourceUrl, excerpt: `${fullName}${reason ? ` · ${reason}` : ""}`.slice(0, 500), observedAt: now, sourceType: "directory_agent" }],
            source: "directory_agent",
            sourceRef: { qualifyReason: reason, sourceUrl, discovery: "directory_agent" },
          };
        })
        .filter((x): x is CandidateContact => x !== null);

      const result = await persistLead(ctx, company, contacts);
      return result;
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/**
 * Autonomous helper the source wrapper can call: given a directory listing
 * page, extract companies, then for each crawl the company site, extract +
 * qualify people, resolve emails, and save. Used by the ProspectDataSource
 * fallback path and reused by the agent's higher-level reasoning.
 */
export async function harvestDirectory(
  ctx: AgentRunContext,
  directoryUrl: string,
  perCompanyLimit = 3
): Promise<void> {
  const page = await fetchWithCache(ctx, directoryUrl, "directory_listing");
  if ("error" in page) return;
  const directoryHost = (() => {
    try {
      return new URL(page.finalUrl).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  })();
  const companies = await extractCompaniesFromPage(page, ctx.criteria);

  for (const company of companies) {
    if (ctx.counters.companiesSaved >= ctx.budget.maxCompanies) break;
    if (ctx.counters.pagesFetched >= ctx.budget.maxPages) break;
    if (Date.now() >= ctx.budget.deadlineMs) break;
    const domain = company.domain ? normalizeDomain(company.domain) : null;
    const targetUrl = domain ? `https://${domain}` : company.detailUrl;
    if (!targetUrl) continue;

    const companyPage = await fetchWithCache(ctx, targetUrl, domain ? "company_site" : "company_detail");
    if ("error" in companyPage) continue;
    const people = await extractPeopleFromPage(companyPage, ctx.criteria.personas ?? []);
    if (people.length === 0) continue;

    const effectiveDomain = domain ?? (() => {
      try {
        return new URL(companyPage.finalUrl).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })();
    if (!effectiveDomain) continue;

    const contacts = await buildContactsForCompany(
      {
        name: company.name,
        domain: effectiveDomain,
        websiteUrl: `https://${effectiveDomain}`,
        industry: company.industry,
        location: company.location,
      },
      people,
      ctx.criteria,
      perCompanyLimit
    );

    await persistLead(
      ctx,
      {
        name: company.name,
        domain: effectiveDomain,
        websiteUrl: `https://${effectiveDomain}`,
        industry: company.industry,
        employeeRange: ctx.criteria.companySizeRange ?? null,
        location: company.location,
        icpFitScore: 0.8,
        dataConfidence: 0.7,
        source: "directory_agent",
        sourceRef: { discovery: "directory_agent", directoryUrl: page.finalUrl, directoryHost },
      },
      contacts
    );
  }
}
