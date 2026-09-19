/**
 * Tool declarations + executor for the directory scraping agent.
 *
 * The agent (Gemini function-calling loop in run.ts) uses these to search for
 * directories, open pages, extract companies/people, qualify, resolve emails,
 * and save leads. All fetching goes through the hybrid fetcher (headless
 * escalation) and every page is snapshotted to our DB.
 */

import type { AiToolDeclaration } from "@/lib/ai/openai";
import { getAiClient } from "@/lib/ai/openai";
import { safeAiErrorMessage } from "@/lib/ai/errors";
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

// ── grounded web search ──────────────────────────────────────────────────
function jsonArray(text: string): unknown[] {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const v = JSON.parse(cleaned);
    return Array.isArray(v) ? v : [];
  } catch {
    const s = cleaned.indexOf("[");
    const e = cleaned.lastIndexOf("]");
    if (s < 0 || e <= s) return [];
    try {
      const v = JSON.parse(cleaned.slice(s, e + 1));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
}

async function webSearch(query: string): Promise<Array<{ url: string; title: string }>> {
  const prompt = `Using web search, return up to 10 results most useful for finding B2B companies matching this need: "${query}".
Prefer public directories, industry association member lists, chambers of commerce, and company listing pages. Exclude social networks (LinkedIn, Facebook, X), review aggregators, and data-broker sites.
Return ONLY a JSON array: [{"url":string,"title":string}]. Never invent URLs.`;
  try {
    const { ai, model } = await getAiClient();
    const response = await ai.responses.create({
      model,
      input: prompt,
      max_output_tokens: 2048,
      tools: [{ type: "web_search" }],
    });
    const out: Array<{ url: string; title: string }> = [];
    for (const raw of jsonArray(response.output_text ?? "[]")) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url.trim() : "";
      if (!/^https?:\/\//i.test(url)) continue;
      try {
        if (isExcludedHost(new URL(url).hostname)) continue;
      } catch {
        continue;
      }
      out.push({ url: url.slice(0, 1000), title: typeof o.title === "string" ? o.title.slice(0, 200) : "" });
      if (out.length >= 10) break;
    }
    return out;
  } catch (error) {
    console.error(`[agent] web_search failed: ${safeAiErrorMessage(error)}`);
    return [];
  }
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
    case "web_search": {
      const results = await webSearch(String(args.query ?? ""));
      return { results };
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
