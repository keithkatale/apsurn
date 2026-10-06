/**
 * Signal scout: finds companies with a recent, evidenced reason to buy, then
 * runs the same enrich-and-save tail the ICP pipeline uses. Entered from
 * runDirectoryAgent when the run's criteria carry triggers, so it inherits
 * the run row, progress updates, cancellation, credits, and the 800s job.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRunContext } from "../agent/context";
import type { AgentRunResult, AgentStreamEvent } from "../agent/run";
import { persistLead, type SaveLeadResult } from "../agent/persist";
import type { TriggerSpec } from "../types";
import { collectHiringSignals } from "./hiring";
import { collectNewsSignals } from "./news";
import { collectSocialSignals } from "./social";
import { eventKey, rankLeads } from "./score";
import { DEFAULT_TITLES, enrichAndSave } from "./tail";
import type { ScoredLead, SignalCandidate } from "./types";

const DEFAULT_RECENCY_DAYS = 30;
/** Candidates considered per lead wanted — most lose to no contact, no email, or already being saved. */
const OVERSAMPLE = 3;
const CONCURRENCY = 4;
const KEY_CHUNK = 50;

const TRIGGER_NAME: Record<TriggerSpec["type"], string> = {
  hiring: "hiring",
  funding_news: "funding or news",
  social_pain: "social pain-post",
  tech_website: "tech",
};
const TRIGGER_NARRATION: Record<TriggerSpec["type"], string> = {
  hiring: "Searching job boards for companies hiring for the roles that signal a need…",
  funding_news: "Searching recent news for funding rounds, launches, expansions and key hires, and checking each against its source article…",
  social_pain: "Searching LinkedIn for people describing this problem right now, then matching each to their company…",
  tech_website: "Checking company websites for tech changes…",
};
export const SUPPORTED_TRIGGERS: ReadonlyArray<TriggerSpec["type"]> = ["hiring", "funding_news", "social_pain"];

/** Drops signals this user has already been told about; a company with nothing new left is dropped. Tolerates the table not existing yet. */
export async function dropReportedSignals(db: SupabaseClient, userId: string, leads: ScoredLead[]): Promise<ScoredLead[]> {
  const keys = leads.flatMap((lead) => lead.signals.map((signal) => eventKey(signal)));
  const reported = new Set<string>();
  for (let i = 0; i < keys.length; i += KEY_CHUNK) {
    const { data, error } = await db
      .from("prospect_signals")
      .select("event_key")
      .eq("user_id", userId)
      .in("event_key", keys.slice(i, i + KEY_CHUNK));
    if (error) return leads;
    for (const row of data ?? []) reported.add(row.event_key as string);
  }
  if (reported.size === 0) return leads;
  return leads
    .map((lead) => ({ ...lead, signals: lead.signals.filter((signal) => !reported.has(eventKey(signal))) }))
    .filter((lead) => lead.signals.length > 0);
}

async function recordSignals(db: SupabaseClient, userId: string, runId: string, lead: ScoredLead) {
  const { error } = await db.from("prospect_signals").upsert(
    lead.signals.map((signal) => ({
      user_id: userId,
      domain: lead.domain,
      trigger_type: signal.triggerType,
      event_key: eventKey(signal),
      headline: signal.headline,
      source_url: signal.sourceUrl,
      excerpt: signal.excerpt.slice(0, 500),
      event_date: signal.eventDate,
      score: lead.score,
      run_id: runId,
    })),
    { onConflict: "user_id,trigger_type,event_key", ignoreDuplicates: true },
  );
  if (error) console.warn("[signals] could not record signals:", error.message);
}

export async function runSignalScout(opts: {
  ctx: AgentRunContext;
  targetCount: number;
  emit: (event: AgentStreamEvent) => void;
  checkStopped: () => Promise<string | null>;
}): Promise<AgentRunResult> {
  const { ctx, targetCount, emit, checkStopped } = opts;
  const { db, runId, userId } = ctx;
  const triggers = (ctx.criteria.triggers ?? []).map((spec) => ({ ...spec, recencyDays: spec.recencyDays > 0 ? spec.recencyDays : DEFAULT_RECENCY_DAYS }));
  const result = (stopReason: string, cancelled = false): AgentRunResult => ({
    found: ctx.counters.companiesSaved,
    contactCount: ctx.counters.contactsSaved,
    warnings: ctx.counters.warnings,
    cancelled,
    stopReason,
  });

  const supported = triggers.filter((spec) => SUPPORTED_TRIGGERS.includes(spec.type));
  const unsupported = triggers.filter((spec) => !SUPPORTED_TRIGGERS.includes(spec.type));
  if (supported.length === 0) {
    return result(`trigger type not available yet: ${unsupported.map((spec) => spec.type).join(", ")}`);
  }

  emit({ type: "tool_start", name: "find_companies", args: { source: "signals", triggers: supported.map((spec) => spec.type) } });
  const candidates: SignalCandidate[] = [];
  const want = Math.max(targetCount * OVERSAMPLE * 4, 60);
  for (const spec of supported) {
    const stopped = await checkStopped();
    if (stopped) return result(stopped, stopped === "cancelled");
    const collect = spec.type === "hiring" ? collectHiringSignals : spec.type === "funding_news" ? collectNewsSignals : spec.type === "social_pain" ? collectSocialSignals : null;
    if (!collect) continue;
    emit({ type: "token", text: TRIGGER_NARRATION[spec.type] });
    try {
      const found = await collect({
          criteria: ctx.criteria,
          spec,
          known: ctx.savedDomains,
          want,
          productSummary: ctx.productSummary,
          shouldStop: () => Date.now() >= ctx.budget.deadlineMs,
      });
      candidates.push(...found);
      emit({ type: "token", text: `${found.length} ${found.length === 1 ? "company" : "companies"} with a ${TRIGGER_NAME[spec.type]} signal.` });
    } catch (error) {
      // One trigger failing (search down, a quota) must not discard what the others found.
      ctx.counters.warnings += 1;
      console.warn(`[signals] ${spec.type} collector failed:`, error instanceof Error ? error.message : error);
      emit({ type: "tool_end", name: "find_companies", result: { source: spec.type, count: 0, error: error instanceof Error ? error.message : "collector failed" } });
    }
  }

  const recencyByType = Object.fromEntries(supported.map((spec) => [spec.type, spec.recencyDays]));
  const ranked = await dropReportedSignals(db, userId, rankLeads(candidates, recencyByType, Date.now()));
  const queue = ranked.slice(0, targetCount * OVERSAMPLE);
  emit({ type: "token", text: queue.length ? `Ranked ${queue.length} companies by signal strength and recency. Finding decision makers and verified emails next.` : "No company showed a recent, evidenced signal." });
  emit({
    type: "tool_end",
    name: "find_companies",
    result: {
      source: "signals",
      count: queue.length,
      companies: queue.map((lead) => ({ name: lead.companyName, domain: lead.domain, reason: lead.qualifyReason })),
      ...(unsupported.length ? { note: `Skipped triggers not available yet: ${unsupported.map((spec) => spec.type).join(", ")}` } : {}),
    },
  });
  if (queue.length === 0) return result("no companies showed that signal recently");

  const titles = ctx.criteria.personas?.length ? ctx.criteria.personas : DEFAULT_TITLES;
  let saveChain: Promise<unknown> = Promise.resolve();
  let cursor = 0;
  let outOfCredits = false;

  async function worker() {
    for (;;) {
      if (ctx.counters.companiesSaved >= targetCount || outOfCredits) return;
      if (await checkStopped()) return;
      const lead = queue[cursor++];
      if (!lead) return;

      emit({ type: "tool_start", name: "find_people", args: { domain: lead.domain, reason: lead.qualifyReason } });
      let saved: SaveLeadResult | null = null;
      const outcome = await enrichAndSave(ctx, lead, titles, (company, contacts) => {
        // Saves are serialized: persistLead mutates shared run counters.
        const next: Promise<SaveLeadResult> = (saveChain as Promise<unknown>).then(async () => {
          if (ctx.counters.companiesSaved >= targetCount) return { saved: false, contactCount: 0, reason: "target already reached" };
          emit({ type: "tool_start", name: "save_lead", args: { company: { name: company.name, domain: company.domain }, contacts: [{ fullName: contacts[0]?.fullName }] } });
          const done = await persistLead(ctx, company, contacts);
          emit({ type: "tool_end", name: "save_lead", result: done });
          return done;
        });
        saveChain = next.catch(() => undefined);
        return next.then((done) => {
          saved = done;
          return done;
        });
      }).catch((error: unknown) => ({ saved: false as const, reason: error instanceof Error ? error.message : "enrichment failed" }));
      emit({ type: "tool_end", name: "find_people", result: outcome.saved ? { count: 1 } : { count: 0, reason: outcome.reason } });

      const savedResult = saved as SaveLeadResult | null;
      if (savedResult?.reason === "credits_exhausted") outOfCredits = true;
      if (outcome.saved) {
        await recordSignals(db, userId, runId, lead);
        await db
          .from("prospecting_runs")
          .update({ processed_count: ctx.counters.companiesSaved, contact_count: ctx.counters.contactsSaved, stage: "enriching", updated_at: new Date().toISOString() })
          .eq("id", runId);
      } else {
        ctx.counters.warnings += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  await saveChain;

  if (outOfCredits) return result("not enough credits to save more leads");
  const stopped = await checkStopped();
  if (stopped && ctx.counters.companiesSaved < targetCount) return result(stopped, stopped === "cancelled");
  return result(ctx.counters.companiesSaved >= targetCount ? "target reached" : "no more companies showed that signal");
}
