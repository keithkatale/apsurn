/**
 * Copilot's basic toolkit: small, real tools that each do one thing and return. No pipelines, no background jobs, no
 * waiting. Copilot chains them itself, one step at a time:
 *   web_search / web_scrape to find and read, find_people / find_email / verify_email to reach someone,
 *   save_lead to keep a confirmed lead, present_leads to show a list.
 */
import type { AiToolDeclaration } from "@/lib/ai/openai";
import { findEmail, findPeopleAtCompany, isEmailFinderConfigured } from "@/lib/prospecting/icypeas";
import { domainAcceptsMail, isSendSafe, verifyCandidates, verifyEmail } from "@/lib/prospecting/email-verifier";
import { emailCandidates } from "@/lib/prospecting/email-pattern";
import { assertSafePublicUrl, robotsAllows } from "@/lib/scraper/crawl";
import { fetchPage } from "@/lib/scraper/fetch-page";
import { googleSearch, GoogleSearchError } from "@/lib/search/google-search";
import { saveLeads, remember } from "./lead-save";
import { presentLeads } from "./present-leads";
import type { AgentToolContext } from "./types";

export const TOOLKIT_TOOLS: AiToolDeclaration[] = [
  {
    name: "web_search",
    description:
      "Search Google and return real results (title, url, snippet, date). Use it to find companies, news, funding announcements, launches, job posts or people. Operators work: quotes, site:, OR. Takes 15-30 seconds, so make few, precise queries. Returns an error if search is down; never guess results.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        pastDays: { type: "number", description: "Only results from the last N days (1, 7, 30 or 365 are exact)." },
        domains: { type: "array", items: { type: "string" }, description: "Limit to these sites, e.g. ['techcrunch.com']." },
        limit: { type: "number", description: "1-20, default 8." },
      },
      required: ["query"],
    },
  },
  {
    name: "web_scrape",
    description:
      "Open one public web page and return its readable text and links. Use it to read an article, a company's About/Team page, a job post or a launch page. Returns an error if the page cannot be retrieved (blocked, robots.txt, not public).",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string" },
        render: { type: "boolean", description: "Run the page in a browser first, for pages that load their content with JavaScript." },
        maxChars: { type: "number", description: "Max characters of text to return, default 8000, max 20000." },
      },
      required: ["url"],
    },
  },
  {
    name: "find_people",
    description: "List people who work at a company domain, optionally matching job titles (founder, head of sales). Returns name, title and profile link. Does not return emails.",
    parameters: {
      type: "object",
      properties: {
        domain: { type: "string" },
        titles: { type: "array", items: { type: "string" } },
        limit: { type: "number", description: "1-10, default 3." },
      },
      required: ["domain"],
    },
  },
  {
    name: "find_email",
    description:
      "Find a person's work email from their name and company domain. It searches the contact database and, at the same time, tries every common address format for the name (first.last, first, flast, firstlast, f.last, last, first_last, and more) and checks them all at once. Returns the address only when it is a confirmed real mailbox (status verified), with the formats it tried. No separate verify_email call is needed for the address it returns.",
    parameters: {
      type: "object",
      properties: { fullName: { type: "string" }, domain: { type: "string" } },
      required: ["fullName", "domain"],
    },
  },
  {
    name: "verify_email",
    description:
      "Check whether email addresses are real, deliverable mailboxes. Give one address in email, or up to 10 in emails to check them all at once. Only status 'verified' (safeToSend true) may be saved or mailed.",
    parameters: {
      type: "object",
      properties: { email: { type: "string" }, emails: { type: "array", maxItems: 10, items: { type: "string" } } },
    },
  },
  {
    name: "save_lead",
    description:
      "Save ONE lead (company + person + a verified email + the reason to reach out) into a named prospect list. The email must have passed verify_email. Charges credits for the company. Returns saved true/false and the listId.",
    parameters: {
      type: "object",
      properties: {
        listName: { type: "string", description: "Name for the list, e.g. 'Just-funded B2B SaaS'. The same name reuses the same list." },
        companyName: { type: "string" },
        domain: { type: "string" },
        description: { type: "string", description: "What the company does, from a page you read." },
        fullName: { type: "string" },
        title: { type: "string" },
        linkedinUrl: { type: "string" },
        email: { type: "string" },
        reason: { type: "string", description: "Why this company and person, one sentence, from a source you read." },
        sourceUrl: { type: "string", description: "The page that shows the reason." },
      },
      required: ["companyName", "domain", "fullName", "email", "reason"],
    },
  },
  {
    name: "present_leads",
    description:
      "Show a saved list to the user as a table (description, why picked, outreach angle). Call once after saving. Pass one 1-2 sentence outreach angle per company, built only from facts you read.",
    parameters: {
      type: "object",
      properties: {
        listId: { type: "string" },
        title: { type: "string" },
        angles: { type: "array", items: { type: "object", properties: { company: { type: "string" }, angle: { type: "string" } }, required: ["company", "angle"] } },
      },
      required: ["listId"],
    },
  },
];

export const TOOLKIT_TOOL_NAMES = new Set(TOOLKIT_TOOLS.map((tool) => tool.name));
/** Tools that change the account. The rest are read-only and may run side by side. */
export const TOOLKIT_MUTATING = new Set(["save_lead", "present_leads"]);

function cleanDomain(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
}

export async function runToolkitTool(ctx: AgentToolContext, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "web_search": {
      const query = String(args.query ?? "").trim();
      if (!query) return { error: "A query is required." };
      ctx.progress?.({ stage: "searching", query });
      try {
        const results = await googleSearch(query, {
          limit: Number(args.limit) || 8,
          pastDays: Number(args.pastDays) || undefined,
          domains: Array.isArray(args.domains) ? args.domains.map(String).slice(0, 5) : undefined,
        });
        return { query, count: results.length, results, ...(results.length === 0 ? { note: "Google returned nothing for that query. Try different words." } : {}) };
      } catch (error) {
        return { error: error instanceof GoogleSearchError ? error.message : "Web search failed." };
      }
    }
    case "web_scrape": {
      const url = String(args.url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) return { url, error: "Give a full http(s) URL." };
      ctx.progress?.({ stage: "fetching", url });
      // Say exactly why a page could not be read, so the user (and the model) can tell blocked from missing.
      let root: URL;
      try {
        root = await assertSafePublicUrl(url);
      } catch {
        return { url, error: "That address is not a public web page, so it was not opened." };
      }
      if (!(await robotsAllows(root, root.pathname))) return { url, error: "The site's robots.txt does not allow reading that page." };
      const page = await fetchPage(url, { render: args.render === true });
      if (!page) return { url, error: "The page did not load: it is blocked, timed out, or does not exist." };
      if (page.status >= 400) return { url: page.finalUrl, error: `The site answered HTTP ${page.status}.`, status: page.status };
      const max = Math.min(20_000, Math.max(500, Number(args.maxChars) || 5_000));
      return { url: page.finalUrl, title: page.title, status: page.status, chars: page.text.length, rendered: page.rendered, text: page.text.slice(0, max), truncated: page.text.length > max, links: page.links.slice(0, 40) };
    }
    case "find_people": {
      const domain = cleanDomain(args.domain);
      if (!domain) return { error: "A company domain is required." };
      if (!isEmailFinderConfigured()) return { error: "The contact database is not configured (ICYPEAS_API_KEY)." };
      const titles = Array.isArray(args.titles) ? args.titles.map(String).slice(0, 8) : [];
      const limit = Math.min(10, Math.max(1, Number(args.limit) || 3));
      const found = (await findPeopleAtCompany(domain, titles, limit)) ?? [];
      return { domain, count: found.length, people: found.map((p) => ({ fullName: p.fullName, title: p.title, linkedinUrl: p.profileUrl, location: p.location })) };
    }
    case "find_email": {
      const fullName = String(args.fullName ?? "").trim();
      const domain = cleanDomain(args.domain);
      if (!fullName || !domain) return { error: "fullName and domain are required." };
      if (!isEmailFinderConfigured()) return { error: "Email lookup is not configured (ICYPEAS_API_KEY)." };
      if ((await domainAcceptsMail(domain)) === false) return { email: null, reason: "that domain has no mail server" };
      const guesses = emailCandidates(fullName, domain, null);
      ctx.progress?.({ stage: "trying", formats: guesses.length });
      // The database lookup and every format guess run together; whichever confirms first-ranked wins.
      const [found, guessed] = await Promise.all([findEmail(fullName, domain).catch(() => null), verifyCandidates(guesses).catch(() => ({ verified: null, verdicts: [] }))]);
      const fromDatabase = found && found.status === "verified" ? found.email : null;
      const email = fromDatabase ?? guessed.verified;
      const tried = guessed.verdicts.map((verdict) => verdict.email.split("@")[0]);
      if (email) {
        remember(ctx.userId, email);
        return { email, status: "verified", source: fromDatabase ? "contact database" : "format guess", tried: tried.length };
      }
      // The database may know an address it is not sure of; confirm it before saying so.
      if (found) {
        const check = await verifyEmail(found.email);
        if (isSendSafe(check.status)) {
          remember(ctx.userId, found.email);
          return { email: found.email, status: "verified", source: "contact database", tried: tried.length };
        }
      }
      return { email: null, reason: `No confirmed mailbox: checked ${tried.length} common formats (${tried.slice(0, 6).join(", ")}…) and the contact database.`, tried: tried.length };
    }
    case "verify_email": {
      const list = (Array.isArray(args.emails) ? args.emails : []).map((value) => String(value).trim().toLowerCase()).filter((value) => value.includes("@")).slice(0, 10);
      const single = String(args.email ?? "").trim().toLowerCase();
      if (list.length > 1 || (list.length === 1 && !single)) {
        const { verdicts } = await verifyCandidates(list);
        const results = verdicts.map((verdict) => ({ email: verdict.email, status: verdict.status, safeToSend: verdict.status === "verified" }));
        for (const row of results) if (row.safeToSend) remember(ctx.userId, row.email);
        return { count: results.length, verified: results.filter((row) => row.safeToSend).length, results };
      }
      const email = single || list[0] || "";
      if (!email.includes("@")) return { error: "A valid email is required." };
      const result = await verifyEmail(email);
      if (result.checks?.reason === "verifier_not_configured") return { error: "No email verifier is configured, so nothing can be confirmed." };
      if (isSendSafe(result.status)) remember(ctx.userId, email);
      return { email, status: result.status, safeToSend: isSendSafe(result.status), checks: result.checks };
    }
    case "save_lead": {
      ctx.progress?.({ company: args.companyName, person: args.fullName, email: args.email });
      const saved = (await saveLeads(ctx, { listName: args.listName, leads: [{ ...args, signalUrl: args.sourceUrl }] })) as Record<string, unknown>;
      const first = Array.isArray(saved.results) ? (saved.results[0] as { saved?: boolean; reason?: string } | undefined) : undefined;
      // One lead per call: an unsaved lead is a failed call, with the reason.
      if (typeof saved.error === "string") return saved;
      if (first && first.saved === false) return { error: first.reason ?? "The lead was not saved.", company: args.companyName, person: args.fullName };
      return { ...saved, company: args.companyName, person: args.fullName, email: args.email };
    }
    case "present_leads":
      return presentLeads(ctx, args);
    default:
      throw new Error(`Unknown toolkit tool: ${name}`);
  }
}
