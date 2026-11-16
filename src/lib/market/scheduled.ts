import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { runRadarScan } from "./scan-run";

const STALE_MS = 6 * 60 * 60 * 1000;
const COMPANIES_PER_TICK = 2;

/** Refreshes a few companies whose listening phrases have gone quiet. Shallow, and it does not spend credits. */
export async function runDueRadarScans(db: SupabaseClient = createAdminClient()): Promise<{ companies: number }> {
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await db.from("market_keywords").select("company_id, user_id, last_scanned_at").eq("is_active", true).limit(500);
  if (error) throw new Error(error.message);

  const byCompany = new Map<string, { userId: string; newest: string | null }>();
  for (const row of data ?? []) {
    const companyId = row.company_id as string;
    const scanned = (row.last_scanned_at as string | null) ?? null;
    const current = byCompany.get(companyId);
    if (!current) {
      byCompany.set(companyId, { userId: row.user_id as string, newest: scanned });
      continue;
    }
    if (scanned && (!current.newest || scanned > current.newest)) current.newest = scanned;
  }

  const due = [...byCompany.entries()].filter(([, value]) => !value.newest || value.newest < cutoff).slice(0, COMPANIES_PER_TICK);
  for (const [companyId, value] of due) {
    try {
      await runRadarScan(db, { userId: value.userId, companyId, depth: "broad", skipIfFresh: true });
    } catch (scanError) {
      console.warn("[radar] scheduled scan failed:", companyId, scanError instanceof Error ? scanError.message : scanError);
    }
  }
  return { companies: due.length };
}
