/**
 * Read-only smoke test for the funding/news collector: searches the web for
 * recent events, validates them against the cited pages, resolves domains and
 * prints ranked leads with evidence. Saves nothing and spends no credits.
 *
 *   npx tsx scripts/smoke-signal-news.ts "fintech" 30 funding
 */
import { collectNewsSignals } from "../src/lib/prospecting/signals/news";
import { rankLeads } from "../src/lib/prospecting/signals/score";
import type { TriggerEventKind } from "../src/lib/prospecting/types";

const [industry = "software", days = "30", kind = "funding"] = process.argv.slice(2);

async function main() {
  const started = Date.now();
  const candidates = await collectNewsSignals({
    criteria: { industries: [industry], geographies: ["United States"], personas: ["Founder"] },
    spec: { type: "funding_news", recencyDays: Number(days), eventKinds: [kind as TriggerEventKind] },
    known: new Set(),
    want: 20,
    shouldStop: () => Date.now() - started > 150_000,
  });
  const leads = rankLeads(candidates, { funding_news: Number(days) }, Date.now());
  console.log(`${candidates.length} companies with a validated, dated event, in ${Math.round((Date.now() - started) / 1000)}s`);
  for (const lead of leads.slice(0, 12)) {
    console.log(`\n${lead.score.toFixed(2)}  ${lead.companyName} (${lead.domain})\n  ${lead.qualifyReason}`);
    for (const signal of lead.signals.slice(0, 1)) console.log(`  ${signal.eventDate?.slice(0, 10)}  ${signal.sourceUrl}`);
  }
}

main().catch((error) => {
  console.error("FAILED:", error?.message ?? error);
  process.exit(1);
});
