/** Pure hiring-signal construction. Type-only imports so it runs under node:test (hiring.test.ts). */
import type { AtsRole } from "../sources/ats";
import type { SignalCandidate } from "./types";

export interface HiringSeed {
  name: string;
  industry: string | null;
  location: string | null;
  size: number | null;
}

/** "Hiring 3 roles incl. SDR (posted 9d ago)" from roles that already matched the target keywords. */
export function hiringCandidateFromRoles(
  roles: AtsRole[],
  companyName: string | null,
  domain: string,
  recencyDays: number,
  seed: HiringSeed,
): SignalCandidate | null {
  const fresh = roles.filter((role) => role.ageDays === null || role.ageDays <= recencyDays);
  if (fresh.length === 0) return null;

  // Newest first; an undated role sorts last rather than being trusted as fresh.
  const sorted = [...fresh].sort((a, b) => (a.ageDays ?? Number.POSITIVE_INFINITY) - (b.ageDays ?? Number.POSITIVE_INFINITY));
  const lead = sorted[0];
  const age = lead.ageDays === null ? "" : ` (posted ${Math.round(lead.ageDays)}d ago)`;
  const headline = fresh.length === 1 ? `Hiring a ${lead.title}${age}` : `Hiring ${fresh.length} roles incl. ${lead.title}${age}`;

  return {
    companyName: companyName ?? seed.name,
    domain,
    triggerType: "hiring",
    headline,
    sourceUrl: lead.url,
    excerpt: sorted
      .slice(0, 3)
      .map((role) => role.title)
      .join("; "),
    eventDate: lead.publishedAt,
    strength: Math.min(1, 0.4 + fresh.length * 0.2),
    industry: seed.industry,
    location: seed.location ?? lead.location,
    companySize: seed.size,
  };
}
