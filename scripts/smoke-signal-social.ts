/**
 * Read-only smoke test for the social-pain collector: searches LinkedIn posts,
 * judges which authors describe a current pain, resolves their company and
 * prints the ranked leads. Saves nothing and spends no credits (Apify usage aside).
 *
 *   npx tsx scripts/smoke-signal-social.ts "struggling to find leads" 14
 */
import { collectSocialSignals } from "../src/lib/prospecting/signals/social";
import { rankLeads } from "../src/lib/prospecting/signals/score";

const [keyword = "struggling to find leads", days = "14"] = process.argv.slice(2);

async function main() {
  const started = Date.now();
  const candidates = await collectSocialSignals({
    criteria: { industries: ["software"], geographies: ["United States"], personas: ["Founder"] },
    spec: { type: "social_pain", keywords: [keyword], recencyDays: Number(days) },
    known: new Set(),
    want: 20,
    productSummary: "outbound sales and lead generation tooling",
    shouldStop: () => Date.now() - started > 150_000,
  });
  const leads = rankLeads(candidates, { social_pain: Number(days) }, Date.now());
  console.log(`${candidates.length} companies with a pain post, in ${Math.round((Date.now() - started) / 1000)}s`);
  for (const lead of leads.slice(0, 12)) {
    console.log(`\n${lead.score.toFixed(2)}  ${lead.companyName} (${lead.domain})\n  ${lead.qualifyReason}`);
    for (const signal of lead.signals.slice(0, 1)) console.log(`  ${signal.eventDate?.slice(0, 10)}  ${signal.sourceUrl}`);
  }
}

main().catch((error) => {
  console.error("FAILED:", error?.message ?? error);
  process.exit(1);
});
