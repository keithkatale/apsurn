/**
 * Keyless Organic Signal Prospecting Radar.
 * Orchestrates multi-channel intent discovery across Reddit, Hacker News,
 * startup launch feeds, remote hiring boards, and DuckDuckGo web search.
 * 100% keyless, zero Apify actors, zero paid API tokens.
 * Scales to 100s of prospects with live background progression.
 */
import { scanRedditIntent } from "./reddit-radar";
import { scanFundingAndLaunches } from "./funding-radar";
import { scanHiringSignals } from "./hiring-radar";
import { duckDuckGoSearch } from "@/lib/search/duckduckgo";
import type { DiscoveredSignal, RadarScanOptions } from "./types";

export * from "./types";

export interface SourcedSignalLead {
  id: string;
  companyName: string;
  domain: string | null;
  contactName: string | null;
  contactTitle: string | null;
  email: string | null;
  signalTitle: string;
  signalReason: string;
  sourceUrl: string;
  source: string;
  intentScore: number;
  suggestedAngle: string;
}

/** Instant first-wave scan (YC & launches) completing in ~1s to paint live table immediately. */
export async function scanFastWave(
  options: RadarScanOptions = {},
): Promise<SourcedSignalLead[]> {
  const limit = Math.min(40, Math.max(5, options.limit ?? 20));
  const keywords = (options.keywords ?? []).filter(Boolean);
  const fastSignals = await scanFundingAndLaunches(keywords, { limit }).catch(() => []);
  fastSignals.sort((a, b) => b.intentScore - a.intentScore);

  const seenKeys = new Set<string>();
  const leads: SourcedSignalLead[] = [];
  for (const sig of fastSignals) {
    const key = sig.domain ? sig.domain.toLowerCase() : sig.title.toLowerCase().slice(0, 40);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    leads.push({
      id: crypto.randomUUID(),
      companyName: sig.companyName,
      domain: sig.domain,
      contactName: sig.contactName,
      contactTitle: sig.contactTitle,
      email: null,
      signalTitle: sig.title,
      signalReason: sig.snippet,
      sourceUrl: sig.sourceUrl,
      source: sig.platform,
      intentScore: sig.intentScore,
      suggestedAngle: sig.suggestedAngle ?? `Identified buying intent from ${sig.platform}`,
    });
  }
  return leads;
}

/** Full multi-channel radar scan supporting up to 100s of prospects. */
export async function runOrganicSignalRadar(
  options: RadarScanOptions = {},
  onProgress?: (stage: string) => void,
): Promise<SourcedSignalLead[]> {
  const limit = Math.min(200, Math.max(10, options.limit ?? 50));
  const keywords = (options.keywords ?? []).filter(Boolean);
  const competitors = (options.competitors ?? []).filter(Boolean);

  onProgress?.("Scanning Reddit for buying intent & competitor dissatisfaction...");
  const redditPromise = scanRedditIntent(keywords.length > 0 ? keywords : ["SaaS", "B2B", "software"], {
    competitors,
    limit: Math.ceil(limit / 2),
  }).catch(() => []);

  onProgress?.("Scanning Hacker News launches & Ask HN tool recommendations...");
  const fundingPromise = scanFundingAndLaunches(keywords, {
    limit: Math.ceil(limit / 2),
  }).catch(() => []);

  onProgress?.("Scanning hiring signals & team expansions...");
  const hiringPromise = scanHiringSignals(keywords, {
    limit: Math.ceil(limit / 2),
  }).catch(() => []);

  // Web buying intent search via keyless DuckDuckGo
  const webPromise = (async () => {
    try {
      const primaryTerm = keywords[0] || "B2B SaaS";
      const q = competitors.length > 0
        ? `"${competitors[0]}" alternative OR "looking for tool" "${primaryTerm}"`
        : `"looking for tool" OR "recommend software" "${primaryTerm}"`;
      const searchHits = await duckDuckGoSearch(q, { limit: Math.min(20, Math.ceil(limit / 4)) });
      return searchHits.map((hit): DiscoveredSignal => {
        let domain: string | null = null;
        try {
          domain = new URL(hit.url).hostname.replace(/^www\./, "");
        } catch {
          // Fall through
        }
        return {
          id: `web_${Math.random().toString(36).slice(2, 8)}`,
          companyName: domain ? domain.split(".")[0].toUpperCase() : hit.title.slice(0, 30),
          domain,
          contactName: null,
          contactTitle: "Web Prospect",
          title: hit.title,
          snippet: hit.snippet,
          sourceUrl: hit.url,
          platform: "web",
          signalType: "tool_recommendation",
          intentScore: 78,
          detectedAt: new Date().toISOString(),
          suggestedAngle: `Follow up on public discussion: "${hit.title.slice(0, 60)}"`,
        };
      });
    } catch {
      return [];
    }
  })();

  const [redditSignals, fundingSignals, hiringSignals, webSignals] = await Promise.all([
    redditPromise,
    fundingPromise,
    hiringPromise,
    webPromise,
  ]);

  const allSignals: DiscoveredSignal[] = [
    ...redditSignals,
    ...fundingSignals,
    ...hiringSignals,
    ...webSignals,
  ];

  // Sort by intent score descending
  allSignals.sort((a, b) => b.intentScore - a.intentScore);

  // Deduplicate by domain or title
  const seenKeys = new Set<string>();
  const leads: SourcedSignalLead[] = [];

  for (const sig of allSignals) {
    const key = sig.domain ? sig.domain.toLowerCase() : sig.title.toLowerCase().slice(0, 40);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    leads.push({
      id: crypto.randomUUID(),
      companyName: sig.companyName,
      domain: sig.domain,
      contactName: sig.contactName,
      contactTitle: sig.contactTitle,
      email: null,
      signalTitle: sig.title,
      signalReason: sig.snippet,
      sourceUrl: sig.sourceUrl,
      source: sig.platform,
      intentScore: sig.intentScore,
      suggestedAngle: sig.suggestedAngle ?? `Identified buying intent from ${sig.platform}`,
    });

    if (leads.length >= limit) break;
  }

  return leads;
}
