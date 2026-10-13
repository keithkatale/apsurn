/**
 * The shared back half of every trigger: a ranked lead (company + the reason
 * to reach out now) becomes a saved lead with a named decision maker and a
 * verified email, carrying the signal as qualify_reason and evidence.
 *
 * Hard rule: the canonical index is read before anything paid. A verified
 * address we already hold costs nothing; Icypeas is only called to fill gaps.
 */
import { extractPeople } from "../contact-extract";
import { findPeopleAtCompany, isEmailFinderConfigured, type FoundPerson } from "../icypeas";
import { crawlSite } from "@/lib/scraper/crawl";
import type { Pattern } from "../email-pattern";
import { findKnownContact } from "../index-lookup";
import { persistLead, type SaveLeadResult } from "../agent/persist";
import { learnEmailPattern, resolveEmail } from "../agent/shared";
import type { AgentRunContext } from "../agent/context";
import type { CandidateCompany, CandidateContact, ContactEvidence, ExtractedPerson } from "../types";
import type { ScoredLead, SignalCandidate } from "./types";

export const DEFAULT_TITLES = ["Founder", "Co-Founder", "CEO", "Head of Sales", "VP Sales", "Head of Growth"];

export function normalizeName(fullName: string): string {
  return fullName
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function evidenceFor(signals: SignalCandidate[], domain: string): ContactEvidence[] {
  const now = new Date().toISOString();
  return signals.slice(0, 3).map((signal) => ({
    url: signal.sourceUrl ?? `https://${domain}`,
    excerpt: `${signal.headline} — ${signal.excerpt}`.slice(0, 500),
    observedAt: signal.eventDate ?? now,
    sourceType: signal.triggerType,
  }));
}

export function personFrom(found: FoundPerson, domain: string): ExtractedPerson {
  const url = found.profileUrl ?? `https://${domain}`;
  return {
    fullName: found.fullName,
    normalizedName: normalizeName(found.fullName),
    title: found.title,
    location: found.location,
    sourceUrl: url,
    email: null,
    phone: null,
    profileUrl: found.profileUrl,
    evidence: { url, excerpt: `${found.fullName}${found.title ? ` — ${found.title}` : ""}`, observedAt: new Date().toISOString(), sourceType: "icypeas" },
  };
}

const TITLE_PRIORITY = [/co-?founder|founder/i, /\bceo\b|chief executive/i, /head of (sales|growth|revenue|gtm|marketing)|vp (of )?(sales|growth|revenue|marketing)|chief (revenue|growth|marketing)/i, /\bcto\b|chief technology|head of/i];

function titleRank(person: ExtractedPerson, wanted: string[]): number {
  const title = person.title ?? "";
  const exact = wanted.findIndex((want) => want && title.toLowerCase().includes(want.toLowerCase()));
  if (exact >= 0) return exact;
  const general = TITLE_PRIORITY.findIndex((pattern) => pattern.test(title));
  return general >= 0 ? wanted.length + general : 99;
}

/**
 * The company's own website is the first place to look for a decision maker: founders and leads who are named on
 * their About or Team page, plus any email the page publishes. No database, no paid API; just their public pages.
 */
export async function personFromWebsite(domain: string, titles: string[]): Promise<{ person: ExtractedPerson; pattern: Pattern | null } | null> {
  let snapshot: Awaited<ReturnType<typeof crawlSite>>;
  try {
    snapshot = await crawlSite(domain);
  } catch {
    return null;
  }
  const people = await extractPeople(snapshot, titles);
  if (people.length === 0) return null;
  const ranked = [...people].sort((a, b) => titleRank(a, titles) - titleRank(b, titles) || Number(Boolean(b.email)) - Number(Boolean(a.email)));
  return { person: ranked[0], pattern: learnEmailPattern(people, domain) };
}

/** The person to contact: whoever the signal named, else the best-fit person on the company's own site, else the contact database as a last resort. */
async function pickPerson(lead: ScoredLead, titles: string[]): Promise<{ person: ExtractedPerson; pattern: Pattern | null } | null> {
  const hint = lead.signals.find((signal) => signal.personHint?.name)?.personHint;
  if (hint?.name) {
    return { person: personFrom({ fullName: hint.name, firstName: "", lastName: "", title: hint.title ?? null, companyName: lead.companyName, location: null, profileUrl: hint.profileUrl ?? null, headline: null }, lead.domain), pattern: null };
  }
  const fromSite = await personFromWebsite(lead.domain, titles);
  if (fromSite) return fromSite;
  if (!isEmailFinderConfigured()) return null;
  const withTitles = await findPeopleAtCompany(lead.domain, titles, 3);
  const found = withTitles?.[0] ?? (await findPeopleAtCompany(lead.domain, [], 3))?.[0];
  return found ? { person: personFrom(found, lead.domain), pattern: null } : null;
}

export type TailOutcome =
  | { saved: true; contactCount: number; usedIndex: boolean }
  | { saved: false; reason: string };

/** Enrich one ranked lead and persist it. Callers serialize this (persistLead mutates shared run counters). */
export async function enrichAndSave(
  ctx: AgentRunContext,
  lead: ScoredLead,
  titles: string[],
  save: (company: CandidateCompany, contacts: CandidateContact[]) => Promise<SaveLeadResult> = (company, contacts) => persistLead(ctx, company, contacts),
): Promise<TailOutcome> {
  if (ctx.savedDomains.has(lead.domain)) return { saved: false, reason: "already in this account" };

  const top = lead.signals[0];
  const signalEvidence = evidenceFor(lead.signals, lead.domain);
  const company: CandidateCompany = {
    name: lead.companyName,
    domain: lead.domain,
    websiteUrl: `https://${lead.domain}`,
    industry: top.industry ?? ctx.criteria.industries[0] ?? null,
    employeeRange: top.companySize ? `${top.companySize} employees` : (ctx.criteria.companySizeRange ?? null),
    location: top.location ?? ctx.criteria.geographies[0] ?? null,
    icpFitScore: Math.min(1, 0.5 + lead.score / 2),
    dataConfidence: 0.8,
    source: "signal_scout",
    sourceRef: {
      discovery: "signal_scout",
      triggers: lead.signals.map((signal) => ({ type: signal.triggerType, headline: signal.headline, url: signal.sourceUrl, date: signal.eventDate })),
    },
  };

  const known = await findKnownContact(ctx.db, lead.domain, titles);
  let contact: CandidateContact;
  if (known) {
    contact = {
      fullName: known.fullName,
      normalizedName: normalizeName(known.fullName),
      title: known.title,
      location: null,
      email: known.email,
      emailStatus: known.emailStatus,
      phone: null,
      linkedinUrl: null,
      origin: "public",
      confidence: known.emailStatus === "verified" ? 0.85 : 0.7,
      evidence: signalEvidence,
      source: "signal_scout",
      sourceRef: { qualifyReason: lead.qualifyReason, discovery: "signal_scout", fromIndex: true },
    };
  } else {
    const picked = await pickPerson(lead, titles);
    if (!picked) return { saved: false, reason: "no decision maker found" };
    const { person, pattern } = picked;
    const resolved = await resolveEmail(person, lead.domain, pattern);
    if (!resolved.email) return { saved: false, reason: "no email found" };
    contact = {
      fullName: person.fullName,
      normalizedName: person.normalizedName,
      title: person.title,
      location: person.location,
      email: resolved.email,
      emailStatus: resolved.status,
      phone: null,
      linkedinUrl: person.profileUrl,
      origin: resolved.origin,
      confidence: resolved.status === "verified" ? 0.85 : resolved.status === "accept_all" ? 0.7 : 0.5,
      evidence: [...signalEvidence, person.evidence],
      source: "signal_scout",
      sourceRef: { qualifyReason: lead.qualifyReason, discovery: "signal_scout", verification: resolved.checks },
    };
  }

  const result = await save(company, [contact]);
  if (!result.saved) return { saved: false, reason: result.reason ?? "not saved" };
  return { saved: true, contactCount: result.contactCount, usedIndex: Boolean(known) };
}
