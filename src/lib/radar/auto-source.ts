/** Auto-source contacts for high-scoring signals, respecting credit budgets. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { spendCredits } from "@/lib/billing/credits";
import { enrichAndSave } from "@/lib/prospecting/signals/tail";
import type { AgentRunContext } from "@/lib/prospecting/agent/context";
import type { SignalCandidate, ScoredLead } from "@/lib/prospecting/signals/types.ts";

interface SignalRow {
  id: string;
  domain: string | null;
  entity_name: string | null;
  score: number;
  status: string;
  excerpt: string;
  event_at: string | null;
  url: string;
  title: string;
}

/** Load unsourced high-score signals for today; count auto-sourced rows. */
export async function readyForAutoSource(
  db: SupabaseClient,
  userId: string,
  companyId: string,
  minScore: number,
  limit: number,
): Promise<{ signals: SignalRow[]; autoSourcedToday: number }> {
  const today = new Date().toDateString();
  const { data: signals, error: sigError } = await db
    .from("radar_signals")
    .select("id, domain, entity_name, score, status, excerpt, event_at, url, title")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .gte("score", minScore)
    .eq("status", "new")
    .is("prospect_company_id", null)
    .order("score", { ascending: false })
    .limit(limit);

  const { count: auto, error: countError } = await db
    .from("radar_signals")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .eq("status", "auto_sourced")
    .gte("last_seen_at", new Date(`${today} 00:00:00`).toISOString());

  if (sigError) throw new Error(sigError.message);
  if (countError) throw new Error(countError.message);

  return { signals: (signals ?? []) as SignalRow[], autoSourcedToday: auto ?? 0 };
}

/** Turn a radar signal into a lead so enrichAndSave can process it. */
function signalToCandidate(signal: SignalRow): SignalCandidate {
  return {
    companyName: signal.entity_name || "Unknown",
    domain: signal.domain,
    triggerType: "social_pain",
    headline: signal.title || signal.excerpt?.split("\n")[0] || "Signal",
    sourceUrl: signal.url,
    excerpt: signal.excerpt || "",
    eventDate: signal.event_at,
    strength: signal.score / 100,
  };
}

/** Auto-source one signal if credits allow, mark it auto_sourced or dismiss it. */
export async function tryAutoSourceSignal(
  db: SupabaseClient,
  userId: string,
  signal: SignalRow,
  budget: number,
  ctx: AgentRunContext,
): Promise<boolean> {
  if (budget <= 0 || !signal.domain) return false;

  const lead: ScoredLead = {
    domain: signal.domain,
    companyName: signal.entity_name || "Unknown",
    signals: [signalToCandidate(signal)],
    score: signal.score / 100,
    qualifyReason: signal.title,
  };

  try {
    await spendCredits({
      userId,
      amount: 8,
      action: "radar_auto_source",
      metadata: { signalId: signal.id },
    });

    const outcome = await enrichAndSave(ctx, lead, ["CEO", "Founder", "Sales", "Growth"]);
    if (!outcome.saved) {
      await db.from("radar_signals").update({ status: "dismissed" }).eq("id", signal.id);
      return false;
    }

    await db.from("radar_signals").update({ status: "auto_sourced", prospect_company_id: outcome.contactCount ? signal.id : null }).eq("id", signal.id);
    return true;
  } catch (error) {
    const code = (error as Error & { code?: string }).code;
    if (code === "credits_exhausted" || code === "budget_exhausted") {
      return false;
    }
    console.warn("[radar] auto-source failed:", error instanceof Error ? error.message : error);
    return false;
  }
}
