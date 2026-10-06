/**
 * Read-only smoke test for the hiring signal collector: seeds companies from
 * the ICP, checks their public job boards, prints the ranked leads and the
 * evidence behind each. Saves nothing and spends no credits beyond the
 * Icypeas company search.
 *
 *   npx tsx scripts/smoke-signal-hiring.ts "Computer Software" "United States" 25
 */
import { collectHiringSignals } from "../src/lib/prospecting/signals/hiring";
import { rankLeads } from "../src/lib/prospecting/signals/score";

const [industry = "Computer Software", geography = "United States", want = "25"] = process.argv.slice(2);

async function main() {
  const started = Date.now();
  const candidates = await collectHiringSignals({
    criteria: { industries: [industry], geographies: [geography], personas: ["Head of Sales"] },
    spec: { type: "hiring", recencyDays: 45 },
    known: new Set(),
    want: Number(want),
    shouldStop: () => Date.now() - started > 90_000,
  });
  const leads = rankLeads(candidates, { hiring: 45 }, Date.now());
  console.log(`${candidates.length} companies with a recent matching role, in ${Math.round((Date.now() - started) / 1000)}s`);
  for (const lead of leads.slice(0, 15)) {
    console.log(`\n${lead.score.toFixed(2)}  ${lead.companyName} (${lead.domain})\n  ${lead.qualifyReason}`);
    for (const signal of lead.signals.slice(0, 1)) console.log(`  ${signal.sourceUrl ?? "(no url)"}  [${signal.excerpt}]`);
  }
}

main().catch((error) => {
  console.error("FAILED:", error?.message ?? error);
  process.exit(1);
});
