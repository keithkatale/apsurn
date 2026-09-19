/**
 * ProspectDataSource wrapper for the directory agent.
 *
 * The primary run path is the autonomous agent loop (agent/run.ts, invoked by
 * runProspecting). This wrapper exists for interface compatibility and for the
 * daily index refresh (refreshProspectIndex), which calls findContacts on a
 * known company. It reuses the same shared building blocks (crawl -> extract ->
 * qualify -> resolve email) without the LLM tool-loop.
 */

import { crawlSite } from "@/lib/scraper/crawl";
import { extractPeople } from "../contact-extract";
import { discoverCompanies } from "../discovery";
import type { CandidateCompany, CandidateContact, ProspectCriteria, ProspectDataSource } from "../types";
import { buildContactsForCompany } from "../agent/shared";

async function findCompanies(
  criteria: ProspectCriteria,
  opts: { limit: number }
): Promise<CandidateCompany[]> {
  // Non-agent fallback discovery (grounded search). The agent path handles the
  // richer directory crawl; this keeps the generic pipeline usable.
  const discovered = await discoverCompanies(criteria, Math.min(Math.max(opts.limit * 3, opts.limit), 90));
  return discovered.map((company) => ({
    name: company.name,
    domain: company.domain,
    websiteUrl: `https://${company.domain}`,
    industry: criteria.industries[0] ?? null,
    employeeRange: criteria.companySizeRange ?? null,
    location: criteria.geographies[0] ?? null,
    icpFitScore: 0.75,
    dataConfidence: 0.7,
    source: "directory_agent",
    sourceRef: { discovery: "grounded_fallback", discoveryAngle: company.angle, evidenceUrl: company.evidenceUrl },
  }));
}

async function findContacts(
  company: CandidateCompany,
  criteria: ProspectCriteria,
  opts: { limit: number }
): Promise<CandidateContact[]> {
  let snapshot = null;
  try {
    snapshot = await crawlSite(company.websiteUrl, { render: true });
  } catch (error) {
    console.error("[directory_agent] crawl failed for", company.domain, error);
    return [];
  }
  const people = await extractPeople(snapshot, criteria.personas ?? []);
  if (people.length === 0) return [];
  return buildContactsForCompany(
    {
      name: company.name,
      domain: company.domain,
      websiteUrl: company.websiteUrl,
      industry: company.industry,
      location: company.location,
    },
    people,
    criteria,
    opts.limit
  );
}

export const directoryAgentSource: ProspectDataSource = {
  id: "directory_agent",
  findCompanies,
  findContacts,
};
