/**
 * Reads the canonical index before any paid lookup. Every saved lead already
 * writes indexed_companies / indexed_people / indexed_employments /
 * contact_points (pipeline.ts), but nothing used to read them back — so a
 * company or person we already hold a verified address for was re-found and
 * re-billed on the next run.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const FRESH_FOR_DAYS = 90;

export interface KnownContact {
  fullName: string;
  title: string | null;
  email: string;
  emailStatus: "verified" | "accept_all";
  lastVerifiedAt: string | null;
  personId: string;
}

export interface KnownContactRow extends KnownContact {
  /** Employment confidence in [0, 1]. */
  confidence: number;
}

/** Prefer a title matching a target persona, then the most confident employment record. Pure, so it can be tested without a database. */
export function pickKnownContact(rows: KnownContactRow[], titles: string[]): KnownContact | null {
  if (rows.length === 0) return null;
  const needles = titles.map((t) => t.toLowerCase().trim()).filter(Boolean);
  const matchesTitle = (row: KnownContactRow) => {
    const title = (row.title ?? "").toLowerCase();
    return needles.length > 0 && needles.some((needle) => title.includes(needle));
  };
  const ranked = [...rows].sort((a, b) => {
    const titleDiff = Number(matchesTitle(b)) - Number(matchesTitle(a));
    if (titleDiff !== 0) return titleDiff;
    const statusDiff = Number(b.emailStatus === "verified") - Number(a.emailStatus === "verified");
    if (statusDiff !== 0) return statusDiff;
    return b.confidence - a.confidence;
  });
  // With target titles given, a verified address for the wrong role isn't worth skipping the paid lookup for.
  if (needles.length > 0 && !matchesTitle(ranked[0])) return null;
  const { confidence: _confidence, ...contact } = ranked[0];
  void _confidence;
  return contact;
}

/** A verified or accept-all email checked within FRESH_FOR_DAYS for a person at this domain, or null. */
export async function findKnownContact(db: SupabaseClient, domain: string, titles: string[]): Promise<KnownContact | null> {
  const { data: company } = await db.from("indexed_companies").select("id").eq("domain", domain.toLowerCase()).maybeSingle();
  if (!company) return null;

  const since = new Date(Date.now() - FRESH_FOR_DAYS * 86_400_000).toISOString();
  const { data: points } = await db
    .from("contact_points")
    .select("person_id, display_value, status, last_verified_at, last_observed_at")
    .eq("company_id", company.id)
    .eq("kind", "email")
    .in("status", ["verified", "accept_all"])
    .gte("last_observed_at", since)
    .limit(25);
  if (!points?.length) return null;

  const personIds = [...new Set(points.map((point) => point.person_id as string))];
  const [{ data: people }, { data: employments }] = await Promise.all([
    db.from("indexed_people").select("id, canonical_name").in("id", personIds),
    db.from("indexed_employments").select("person_id, title, confidence, is_current").eq("company_id", company.id).in("person_id", personIds),
  ]);
  const nameById = new Map((people ?? []).map((person) => [person.id as string, person.canonical_name as string]));
  const employmentById = new Map(
    (employments ?? []).filter((row) => row.is_current !== false).map((row) => [row.person_id as string, row]),
  );

  const rows: KnownContactRow[] = [];
  for (const point of points) {
    const personId = point.person_id as string;
    const fullName = nameById.get(personId);
    const employment = employmentById.get(personId);
    if (!fullName || !employment) continue;
    rows.push({
      personId,
      fullName,
      title: (employment.title as string | null) ?? null,
      email: point.display_value as string,
      emailStatus: point.status === "verified" ? "verified" : "accept_all",
      lastVerifiedAt: (point.last_verified_at as string | null) ?? null,
      confidence: Number(employment.confidence ?? 0.5),
    });
  }
  return pickKnownContact(rows, titles);
}
