import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProspectCriteria } from "../types";
import type { FetchedPage } from "@/lib/scraper/fetch-page";

export interface AgentBudget {
  maxSteps: number;
  maxPages: number;
  maxCompanies: number; // target lead (company) count
  deadlineMs: number; // absolute epoch ms wall-clock cap
}

export interface AgentCounters {
  steps: number;
  pagesFetched: number;
  companiesSaved: number;
  contactsSaved: number;
  warnings: number;
}

export interface AgentRunContext {
  db: SupabaseClient;
  runId: string;
  listId: string;
  userId: string;
  listCompanyId: string; // the user's own company id (owner of the list)
  criteria: ProspectCriteria;
  productSummary: string | null;
  budget: AgentBudget;
  counters: AgentCounters;
  savedDomains: Set<string>; // dedupe companies within a run
  pageCache: Map<string, FetchedPage>; // url -> fetched page (avoid refetch)
}

export function budgetExhausted(ctx: AgentRunContext): string | null {
  if (ctx.counters.companiesSaved >= ctx.budget.maxCompanies) return "target reached";
  if (ctx.counters.steps >= ctx.budget.maxSteps) return "step budget reached";
  if (ctx.counters.pagesFetched >= ctx.budget.maxPages) return "page budget reached";
  if (Date.now() >= ctx.budget.deadlineMs) return "time budget reached";
  return null;
}
