import { crawlSite } from "@/lib/scraper/crawl";
import { extractPeople } from "../contact-extract";
import { emailCandidates, learnEmailPattern } from "../email-pattern";
import { verifyEmail } from "../email-verifier";
import { discoverCompanies } from "../discovery";
import { searchPeopleAtCompany } from "../enrichment/pdl-client";
import type { CandidateCompany, CandidateContact, ProspectCriteria, ProspectDataSource } from "../types";

// Discovery angles built directly from the criteria are inherently
// on-target; industry/persona matches are weighted slightly above
// broader geography-only matches.
const ANGLE_TYPE_SCORE: Record<string, number> = {
  industry: 1,
  persona: 0.9,
  geography: 0.75,
};

async function findCompanies(
  criteria: ProspectCriteria,
  opts: { limit: number }
): Promise<CandidateCompany[]> {
  const discovered = await discoverCompanies(criteria, Math.min(Math.max(opts.limit * 3, opts.limit), 90));

  return discovered.map((company) => ({
    name: company.name,
    domain: company.domain,
    websiteUrl: `https://${company.domain}`,
    industry: criteria.industries[0] ?? null,
    employeeRange: criteria.companySizeRange ?? null,
    location: criteria.geographies[0] ?? null,
    icpFitScore: ANGLE_TYPE_SCORE[company.angleType] ?? 0.7,
    dataConfidence: 0.65,
    source: "web_scrape",
    sourceRef: { discoveryAngle: company.angle, angleType: company.angleType, evidenceUrl: company.evidenceUrl },
  }));
}

async function findContacts(
  company: CandidateCompany,
  criteria: ProspectCriteria,
  opts: { limit: number }
): Promise<CandidateContact[]> {
  let snapshot = null;
  try {
    snapshot = await crawlSite(company.websiteUrl);
  } catch (err) {
    console.error("[prospecting] public crawl failed for", company.domain, err);
  }
  const websitePeople = snapshot ? await extractPeople(snapshot, criteria.personas) : [];
  let providerPeople: Awaited<ReturnType<typeof searchPeopleAtCompany>> = [];
  try {
    providerPeople = await searchPeopleAtCompany(company.domain, { titles: criteria.personas, limit: Math.max(opts.limit * 2, 10) });
  } catch (error) {
    console.error("[prospecting] PDL enrichment failed for", company.domain, error);
  }
  const now = new Date().toISOString();
  const merged = new Map(websitePeople.map((person) => [person.normalizedName, person]));
  for (const person of providerPeople) {
    const fullName = person.fullName?.trim();
    if (!fullName) continue;
    const normalizedName = fullName.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const current = merged.get(normalizedName);
    const sourceUrl = person.linkedinUrl ?? company.websiteUrl;
    merged.set(normalizedName, {
      fullName,
      normalizedName,
      title: current?.title ?? person.title,
      location: current?.location ?? null,
      sourceUrl: current?.sourceUrl ?? sourceUrl,
      email: current?.email ?? person.workEmail?.toLowerCase() ?? null,
      phone: current?.phone ?? person.phone,
      profileUrl: current?.profileUrl ?? person.linkedinUrl,
      evidence: current?.evidence ?? { url: sourceUrl, excerpt: `${fullName}${person.title ? ` — ${person.title}` : ""}`, observedAt: now, sourceType: "licensed_provider" },
    });
  }
  const people = [...merged.values()];
  const pattern = learnEmailPattern(people, company.domain);
  const contacts: CandidateContact[] = [];
  for (const person of people) {
    let email: string | null = null;
    let origin: "public" | "inferred" = "public";
    let verification = person.email ? await verifyEmail(person.email) : null;
    if (person.email && verification?.status === "verified") email = person.email;
    if (!email) {
      origin = "inferred";
      for (const candidate of emailCandidates(person.fullName, company.domain, pattern)) {
        if (candidate === person.email) continue;
        const result = await verifyEmail(candidate);
        if (result.status === "verified") { email = candidate; verification = result; break; }
      }
    }
    const phone = person.phone ?? null;
    if (!email && !phone) continue;
    contacts.push({
      fullName: person.fullName,
      normalizedName: person.normalizedName,
      title: person.title,
      location: person.location,
      email,
      emailStatus: email ? "verified" : verification?.status ?? "risky",
      phone,
      linkedinUrl: person.profileUrl,
      origin,
      confidence: email ? 0.9 : 0.8,
      evidence: [person.evidence],
      source: person.evidence.sourceType === "licensed_provider" ? "people_data_labs" : "public_web",
      sourceRef: { sourceUrl: person.sourceUrl, verification: verification?.checks ?? null },
    });
    if (contacts.length >= opts.limit) break;
  }
  return contacts;
}

export const webScrapeSource: ProspectDataSource = {
  id: "web_scrape",
  findCompanies,
  findContacts,
};
