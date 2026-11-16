#!/usr/bin/env node
/**
 * Node.js CLI Script: Generate 100 Commercial Real Estate Leads
 *
 * Run directly with Node 22+:
 *   node --experimental-strip-types scripts/generate-real-estate-leads.ts
 * or via npm:
 *   npm run generate-leads
 */

import * as path from "node:path";
import { LeadGenerator } from "../src/lib/prospecting/real-estate/lead-generator.ts";

async function main() {
  console.log("Generating 100 Commercial Real Estate Leads (Node.js / TypeScript)...\n");

  const generator = new LeadGenerator();
  const { allLeads, blendedLeads, filteredTopLeads, summary } = generator.generateAllLeads({
    contractorCount: 40,
    buyerCount: 60,
    blendedCount: 20,
    filterTopCount: 15,
  });

  console.log(`✓ Generated ${summary.contractors} contractor leads from permits`);
  console.log(`✓ Generated ${summary.buyers} buyer leads from land purchases`);
  console.log(`✓ Generated ${blendedLeads.length} high-priority dual-match leads`);
  console.log(`\nTotal leads in export: ${allLeads.length}`);

  const rootDir = process.cwd();
  const leadDataDir = path.join(rootDir, "Lead Data");

  const written = await generator.saveToDirectories(allLeads, filteredTopLeads, [
    leadDataDir,
    rootDir,
  ]);

  for (const filePath of written) {
    console.log(`✓ Exported to: ${filePath}`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("LEAD DATABASE SUMMARY");
  console.log("=".repeat(80));
  console.log(`\nTotal Leads: ${summary.total}`);
  console.log(`  - Contractor Leads (from permits): ${summary.contractors}`);
  console.log(`  - Buyer Leads (from land purchases): ${summary.buyers}`);

  const stateKeys = Object.keys(summary.byState).sort();
  console.log(`\nBy State (${stateKeys.length} states):`);
  for (const st of stateKeys) {
    console.log(`  ${st}: ${summary.byState[st]} leads`);
  }

  const highPct = Math.round((summary.byConfidence.high / summary.total) * 100);
  const medPct = Math.round((summary.byConfidence.medium / summary.total) * 100);
  console.log("\nBy Contact Confidence:");
  console.log(`  High: ${summary.byConfidence.high} (${highPct}%)`);
  console.log(`  Medium: ${summary.byConfidence.medium} (${medPct}%)`);

  const apsurnCompanies = generator.toSourcedCompanies(allLeads);
  console.log(`\nApsurn Compatibility:`);
  console.log(`  ✓ Converted ${apsurnCompanies.length} records to SourcedCompany[]`);
}

main().catch((err) => {
  console.error("Error generating leads:", err);
  process.exit(1);
});
