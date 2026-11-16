/**
 * Keyless Hiring & Expansion Signal Scanner.
 * Uses public, unauthenticated APIs from RemoteOK and job RSS feeds
 * to spot companies actively expanding, hiring their first sales reps,
 * growth leads, or engineering teams (strong buying intent for tools).
 */
import type { DiscoveredSignal } from "./types";

interface RemoteOkJob {
  id?: string;
  slug?: string;
  epoch?: number;
  date?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  url?: string;
  company_logo?: string;
}

function cleanDomain(company: string, url?: string): string | null {
  if (url) {
    try {
      const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
      const host = parsed.hostname.replace(/^www\./, "");
      if (!/(remoteok\.com|greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com)$/i.test(host)) {
        return host;
      }
    } catch {
      // Fall through
    }
  }
  const slug = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  return slug ? `${slug}.com` : null;
}

export async function scanHiringSignals(
  keywords: string[] = [],
  options: { limit?: number } = {},
): Promise<DiscoveredSignal[]> {
  const limit = Math.min(100, Math.max(5, options.limit ?? 50));
  const signals: DiscoveredSignal[] = [];
  const seenCompanies = new Set<string>();

  try {
    const res = await fetch("https://remoteok.com/api", {
      headers: {
        "User-Agent": "ApsurnBot/1.0 (+https://apsurn.com; contact: info@apsurn.com)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const jobs = (await res.json()) as RemoteOkJob[];
    // RemoteOK returns legal notice as first element
    const items = Array.isArray(jobs) ? jobs.slice(1) : [];

    const searchTerms = keywords.length > 0 ? keywords.map((k) => k.toLowerCase()) : ["sales", "growth", "lead", "marketing", "devops"];

    for (const job of items) {
      if (!job.company || !job.position) continue;
      const compKey = job.company.toLowerCase().trim();
      if (seenCompanies.has(compKey)) continue;

      const positionLower = job.position.toLowerCase();
      const tags = (job.tags ?? []).map((t) => t.toLowerCase());
      const matchesKeyword = searchTerms.some((term) => positionLower.includes(term) || tags.some((t) => t.includes(term)));

      if (!matchesKeyword && keywords.length > 0) continue;

      seenCompanies.add(compKey);
      const domain = cleanDomain(job.company, job.url);

      signals.push({
        id: `hiring_${job.id ?? Math.random().toString(36).slice(2, 8)}`,
        companyName: job.company,
        domain,
        contactName: "Hiring Manager",
        contactTitle: "Talent / Head of Growth",
        title: `${job.company} is hiring: ${job.position}`,
        snippet: `${job.company} opened a new role for "${job.position}" (Tags: ${(job.tags ?? []).slice(0, 4).join(", ")}). Strong signal of operational expansion.`,
        sourceUrl: job.url || `https://remoteok.com/remote-jobs/${job.slug ?? ""}`,
        platform: "remoteok",
        signalType: "hiring_growth",
        intentScore: 82,
        detectedAt: job.date ?? new Date().toISOString(),
        suggestedAngle: `Congratulate on hiring a ${job.position} and introduce software to streamline their new team's workflow.`,
      });

      if (signals.length >= limit) break;
    }
  } catch {
    // Continue gracefully
  }

  return signals;
}
