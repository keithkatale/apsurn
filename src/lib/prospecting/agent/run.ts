/**
 * The deterministic prospecting run: two explicit steps, no AI anywhere in
 * execution.
 *
 *   STEP 1 — find companies matching the ICP.
 *   STEP 2 — find a decision maker at each of those companies.
 *
 * Both steps, plus resolving an email and persisting the lead, are answered
 * by Icypeas' contact database and our own MX/SMTP verifier — real lookups
 * against real records, never a model's guess. AI's role in prospecting ends
 * one step earlier than this file: generating the company blueprint and the
 * search criteria a user approves (src/app/api/onboarding/blueprint,
 * src/app/api/prospecting/plan). By the time a run starts, the criteria are
 * fixed and everything from here on is retrieval, not judgment.
 *
 * This replaces a Vertex/Gemini function-calling loop that decided its own
 * route call-by-call and regularly spent its whole time budget on ICP terms
 * that didn't match any source's actual vocabulary (see
 * src/lib/prospecting/icypeas-industries.ts for that specific failure and
 * its fix) before falling back to scraping directory pages that don't name
 * decision makers. A fixed two-step order can't wander the way a model
 * choosing its own tools could.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  findCompaniesByIcp,
  findPeopleAtCompany,
  isEmailFinderConfigured,
  translateIcypeasGeography,
  type FoundCompany,
  type FoundPerson,
} from "../icypeas";
import { matchIcypeasIndustries } from "../icypeas-industries";
import { normalizeDomain, resolveEmail } from "./shared";
import { persistLead } from "./persist";
import type { CandidateCompany, CandidateContact, ContactStatus, ExtractedPerson, ProspectCriteria, RunStatus } from "../types";
import { budgetExhausted, type AgentRunContext } from "./context";

export type AgentStreamEvent =
  | { type: "token"; text: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; result: unknown };

const DEFAULT_MAX_ATTEMPTS = 40;
const DEFAULT_WALLCLOCK_MS = 4 * 60_000;
const BACKGROUND_WALLCLOCK_MS = 8 * 60_000;

// How many candidate companies Step 1 pulls per company actually wanted.
// Step 2 finds nobody at a real fraction of companies (Icypeas' index is
// large but not exhaustive), so the input to Step 2 has to be oversampled
// for the run to reliably reach its target.
const COMPANY_OVERSAMPLE = 4;
// Companies are processed with this many Step 2/3 lookups in flight at once.
// The dominant per-lead cost is resolve_email's Icypeas poll (up to ~12s
// worst case), not find_people (typically well under a second), so running
// more of these concurrently is close to a direct multiplier on throughput.
// Each lane is a different company, i.e. a different domain, so this does
// not collide with the verifier's own per-domain rate limit (see the comment
// on the pattern-candidate loop in resolveEmail, which deliberately stays
// sequential for exactly that reason).
const CONCURRENCY = 8;
// GTM roles used when the ICP names no personas at all — the default buyer
// this app looks for absent any more specific instruction.
const DEFAULT_TITLES = ["Founder", "Co-Founder", "CEO", "Head of Sales", "VP Sales", "Head of Growth"];

/** The interactive run's time budget, so the UI can show honest progress and time remaining. */
export function interactiveWallclockMs(): number {
  return num("SCRAPER_WALLCLOCK_MS", DEFAULT_WALLCLOCK_MS);
}

function num(name: string, fallback: number): number {
  const v = Number(process.env[name] ?? "");
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/** "11-50 employees" / "50+ people" / "up to 200" -> a headcount range. Returns {} when the text doesn't parse — an unfiltered search, not a failure. */
function parseHeadcountRange(range: string | undefined): { min?: number; max?: number } {
  if (!range) return {};
  const bounded = range.match(/(\d+)\s*[-–to]+\s*(\d+)/i);
  if (bounded) {
    const [a, b] = [Number(bounded[1]), Number(bounded[2])];
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const plus = range.match(/(\d+)\s*\+/);
  if (plus) return { min: Number(plus[1]) };
  const upTo = range.match(/(?:up to|under|below|max(?:imum)?)\s*(\d+)/i);
  if (upTo) return { max: Number(upTo[1]) };
  return {};
}

export interface AgentRunResult {
  found: number;
  contactCount: number;
  warnings: number;
  cancelled: boolean;
  stopReason: string;
}

async function isCancelled(db: SupabaseClient, runId: string): Promise<boolean> {
  const { data } = await db.from("prospecting_runs").select("status").eq("id", runId).maybeSingle();
  return data?.status === "cancelled";
}

function candidateCompanyFrom(company: FoundCompany, domain: string, criteria: ProspectCriteria): CandidateCompany {
  return {
    name: company.name,
    domain,
    websiteUrl: company.website ?? `https://${domain}`,
    industry: company.industry ?? criteria.industries[0] ?? null,
    employeeRange: company.size ? `${company.size} employees` : criteria.companySizeRange ?? null,
    location: company.location ?? criteria.geographies[0] ?? null,
    // Deterministic and constant, not a model's estimate: every candidate
    // here already matched the ICP's industry/geography/headcount filters by
    // construction, so there is no graded "fit" to express — it either
    // matched the query or it was never returned.
    icpFitScore: 0.8,
    dataConfidence: 0.75,
    source: "icypeas",
    sourceRef: { discovery: "icypeas_company_search", companyIndustry: company.industry, companySize: company.size },
  };
}

/** A person Icypeas named, reshaped into the same evidence-bearing shape the rest of the pipeline (resolveEmail, persistLead) expects. */
function extractedPersonFrom(person: FoundPerson, domain: string): ExtractedPerson {
  const now = new Date().toISOString();
  const sourceUrl = person.profileUrl ?? `https://${domain}`;
  return {
    fullName: person.fullName,
    normalizedName: person.fullName
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim(),
    title: person.title,
    location: person.location,
    sourceUrl,
    email: null,
    phone: null,
    profileUrl: person.profileUrl,
    evidence: {
      url: sourceUrl,
      excerpt: `${person.fullName}${person.title ? ` — ${person.title}` : ""}`,
      observedAt: now,
      sourceType: "icypeas",
    },
  };
}

function candidateContactFrom(person: ExtractedPerson, resolved: { email: string | null; origin: CandidateContact["origin"]; status: ContactStatus; checks: Record<string, unknown> }): CandidateContact {
  return {
    fullName: person.fullName,
    normalizedName: person.normalizedName,
    title: person.title,
    location: person.location,
    email: resolved.email,
    emailStatus: resolved.email ? resolved.status : "risky",
    phone: null,
    linkedinUrl: person.profileUrl,
    origin: resolved.origin,
    confidence: resolved.email
      ? resolved.status === "verified"
        ? 0.85
        : resolved.status === "accept_all"
          ? 0.7
          : 0.5 // "risky": an unverified guess, kept rather than dropped, but ranked below anything the verifier could confirm.
      : 0,
    evidence: [person.evidence],
    source: "icypeas",
    sourceRef: { discovery: "icypeas_find_people", sourceUrl: person.sourceUrl, verification: resolved.checks },
  };
}

/** Runs `items` through `worker` with bounded concurrency, stopping early once `shouldStop()` returns true. */
async function mapWithConcurrency<T>(items: T[], limit: number, shouldStop: () => boolean, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      if (shouldStop()) return;
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  });
  await Promise.all(lanes);
}

export async function runDirectoryAgent(opts: {
  db: SupabaseClient;
  runId: string;
  listId: string;
  userId: string;
  listCompanyId: string;
  criteria: ProspectCriteria;
  productSummary: string | null;
  targetCount: number;
  onEvent?: (event: AgentStreamEvent) => void;
  abortSignal?: AbortSignal;
  wallclockMs?: number;
}): Promise<AgentRunResult> {
  const { db, runId, listId, userId, listCompanyId, criteria, targetCount, onEvent, abortSignal } = opts;

  const ctx: AgentRunContext = {
    db,
    runId,
    listId,
    userId,
    listCompanyId,
    criteria,
    productSummary: opts.productSummary,
    budget: {
      maxSteps: num("SCRAPER_MAX_STEPS", DEFAULT_MAX_ATTEMPTS),
      maxPages: Number.POSITIVE_INFINITY, // No pages are fetched in this pipeline.
      maxCompanies: targetCount,
      deadlineMs: Date.now() + (opts.wallclockMs ?? num("SCRAPER_WALLCLOCK_MS", DEFAULT_WALLCLOCK_MS)),
    },
    counters: { steps: 0, pagesFetched: 0, companiesSaved: 0, contactsSaved: 0, warnings: 0 },
    savedDomains: new Set(),
    pageCache: new Map(),
  };

  const emit = (event: AgentStreamEvent) => onEvent?.(event);
  const checkStopped = async (): Promise<string | null> => {
    if (abortSignal?.aborted) return "cancelled";
    const exhausted = budgetExhausted(ctx);
    if (exhausted) return exhausted;
    if (await isCancelled(db, runId)) return "cancelled";
    return null;
  };

  if (!isEmailFinderConfigured()) {
    throw new Error(
      "The contact database is not configured (ICYPEAS_API_KEY is unset). Finding companies and their decision makers has no other source now that AI is not used for this — set the key, or ask an admin to."
    );
  }

  // STEP 1 — find companies matching the ICP.
  const industries = matchIcypeasIndustries(criteria.industries);
  const geographies = translateIcypeasGeography(criteria.geographies);
  const { min: minHeadcount, max: maxHeadcount } = parseHeadcountRange(criteria.companySizeRange);
  const titles = criteria.personas && criteria.personas.length > 0 ? criteria.personas : DEFAULT_TITLES;

  const step1Args = { industries: criteria.industries, geographies: criteria.geographies, companySizeRange: criteria.companySizeRange };
  emit({ type: "tool_start", name: "find_companies", args: step1Args });

  let companies: FoundCompany[];
  try {
    // Retries once internally on any failure (network, timeout, a bad
    // response) before throwing — see icypeas.ts's postOrThrow. The message
    // on that throw is the real reason, not a guess, so it is passed through
    // as-is below rather than replaced with something generic.
    companies = await findCompaniesByIcp({
      industries,
      geographies,
      minHeadcount,
      maxHeadcount,
      limit: targetCount * COMPANY_OVERSAMPLE,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "the company search failed";
    emit({ type: "tool_end", name: "find_companies", result: { count: 0, error: message } });
    throw new Error(`Finding companies failed: ${message}`);
  }

  emit({
    type: "tool_end",
    name: "find_companies",
    result: { count: companies.length, companies: companies.map((c) => ({ name: c.name, domain: c.website })) },
  });

  if (companies.length === 0) {
    return { found: 0, contactCount: 0, warnings: 0, cancelled: false, stopReason: "no companies matched the ICP" };
  }

  // STEP 2 (per company) — find a decision maker, resolve their email, save.
  // save_lead calls are chained sequentially: ctx.savedDomains/counters are
  // read-then-write across calls and are not safe to touch concurrently.
  let saveChain: Promise<unknown> = Promise.resolve();
  let stopReason = "target reached";
  let cancelled = false;

  await mapWithConcurrency(
    companies,
    CONCURRENCY,
    () => ctx.counters.companiesSaved >= targetCount,
    async (company) => {
      const stopped = await checkStopped();
      if (stopped) {
        stopReason = stopped;
        cancelled = stopped === "cancelled";
        return;
      }
      ctx.counters.steps += 1;

      const domain = company.website ? normalizeDomain(company.website) : null;
      if (!domain) {
        ctx.counters.warnings += 1;
        return;
      }
      if (ctx.savedDomains.has(domain)) return;

      const peopleArgs = { domain, titles };
      emit({ type: "tool_start", name: "find_people", args: peopleArgs });
      let people: FoundPerson[] | null;
      try {
        people = await findPeopleAtCompany(domain, titles, 3);
      } catch {
        people = null;
      }
      if (!people || people.length === 0) {
        emit({
          type: "tool_end",
          name: "find_people",
          result: people === null ? { people: [], error: "The contact-database lookup failed for this domain." } : { people: [], note: "Nobody matches the target titles at this company." },
        });
        ctx.counters.warnings += 1;
        return;
      }
      emit({ type: "tool_end", name: "find_people", result: { count: people.length, people: people.map((p) => ({ fullName: p.fullName, title: p.title })) } });

      const person = extractedPersonFrom(people[0], domain);

      emit({ type: "tool_start", name: "resolve_email", args: { fullName: person.fullName, domain } });
      const resolved = await resolveEmail(person, domain, null);
      emit({ type: "tool_end", name: "resolve_email", result: { email: resolved.email, status: resolved.status } });

      // Re-check the target here, not just at the top of the loop: with
      // several companies in flight at once, more than one lane can reach
      // this point after another lane already hit the target — checked only
      // at loop-pickup, that let a target of 6 save 9. This bounds the
      // overshoot to "a lookup already in flight completes," never "another
      // one starts."
      if (ctx.counters.companiesSaved >= targetCount) return;

      const candidateCompany = candidateCompanyFrom(company, domain, criteria);
      const candidateContact = candidateContactFrom(person, resolved);

      const saveArgs = { company: { name: candidateCompany.name, domain }, contacts: [{ fullName: candidateContact.fullName }] };
      emit({ type: "tool_start", name: "save_lead", args: saveArgs });
      // The saveChain serializes these, so this re-check runs at the actual
      // moment each save reaches the front of the queue — the last point
      // where "already at target" can still be caught before writing.
      const result = await (saveChain = saveChain.then(() =>
        ctx.counters.companiesSaved >= targetCount
          ? { saved: false, contactCount: 0, reason: "target already reached" }
          : persistLead(ctx, candidateCompany, [candidateContact])
      ));
      emit({ type: "tool_end", name: "save_lead", result });
    }
  );

  if (ctx.counters.companiesSaved < targetCount && stopReason === "target reached") {
    stopReason = "no more companies matched";
  }

  return {
    found: ctx.counters.companiesSaved,
    contactCount: ctx.counters.contactsSaved,
    warnings: ctx.counters.warnings,
    cancelled,
    stopReason,
  };
}

/**
 * Full run entry used by background jobs: loads run/list/criteria/blueprint, drives
 * the deterministic pipeline, and maintains prospecting_runs / prospect_lists
 * status + counts.
 */
export async function executeAgentProspectingRun(runId: string, listId: string) {
  const db = createAdminClient();

  const progress = async (status: RunStatus, values: Record<string, unknown> = {}) => {
    await Promise.all([
      db.from("prospecting_runs").update({ status, stage: status, updated_at: new Date().toISOString(), ...values }).eq("id", runId),
      db.from("prospect_lists").update({ status, ...(values.error_summary ? { error: values.error_summary } : {}) }).eq("id", listId),
    ]);
  };

  const { data: run } = await db.from("prospecting_runs").select("user_id,target_count").eq("id", runId).single();
  const { data: list } = await db
    .from("prospect_lists")
    .select("company_id,criteria,requested_count")
    .eq("id", listId)
    .eq("user_id", run?.user_id ?? "")
    .single();
  if (!run || !list) throw new Error("Prospecting run not found");

  const criteria = list.criteria as ProspectCriteria;
  const targetCount = list.requested_count as number;

  const { data: blueprint } = await db
    .from("company_blueprints")
    .select("product_summary")
    .eq("company_id", list.company_id)
    .maybeSingle();

  await progress("discovering", { started_at: new Date().toISOString(), target_count: targetCount });
  await progress("enriching");

  const result = await runDirectoryAgent({
    db,
    runId,
    listId,
    userId: run.user_id as string,
    listCompanyId: list.company_id as string,
    criteria,
    productSummary: (blueprint?.product_summary as string | undefined) ?? null,
    targetCount,
    // Not bounded by an HTTP response, so it can afford the full budget.
    wallclockMs: BACKGROUND_WALLCLOCK_MS,
  });

  if (result.cancelled) {
    return { found: result.found, contactCount: result.contactCount, warnings: result.warnings, cancelled: true };
  }

  const status: RunStatus = result.warnings > 0 && result.found === 0 ? "partial" : result.found > 0 ? "completed" : "partial";
  const completedAt = new Date().toISOString();
  await progress(status, {
    processed_count: result.found,
    contact_count: result.contactCount,
    warning_count: result.warnings,
    completed_at: completedAt,
  });
  await db.from("prospect_lists").update({ found_count: result.found, completed_at: completedAt }).eq("id", listId);

  return { found: result.found, contactCount: result.contactCount, warnings: result.warnings };
}
