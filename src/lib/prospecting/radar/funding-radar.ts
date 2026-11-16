/**
 * Keyless Funding, Launch & Buyer Request Scanner.
 * Queries open, keyless endpoints:
 * 1. Hacker News Show HN (new software launches with founder comments).
 * 2. Hacker News Ask HN (direct community questions asking for tool alternatives).
 * 3. Y Combinator recent batch startups (via open directory).
 * 100% free, zero tokens, zero API keys.
 */
import { ycLaunches, type CommunityLaunch } from "@/lib/prospecting/sources/community";
import type { DiscoveredSignal } from "./types";

interface HnHit {
  objectID: string;
  title: string;
  url?: string;
  author: string;
  created_at: string;
  story_text?: string;
}

interface HnSearchResponse {
  hits?: HnHit[];
}

function cleanDomain(rawUrl: string | undefined | null): string | null {
  if (!rawUrl) return null;
  try {
    const host = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`).hostname.replace(/^www\./, "");
    if (/(github\.com|twitter\.com|x\.com|youtube\.com|ycombinator\.com)$/i.test(host)) return null;
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

export async function scanFundingAndLaunches(
  keywords: string[] = [],
  options: { limit?: number } = {},
): Promise<DiscoveredSignal[]> {
  const limit = Math.min(100, Math.max(5, options.limit ?? 50));
  const signals: DiscoveredSignal[] = [];
  const seenUrls = new Set<string>();

  // 1. Hacker News: Show HN (recent company launches)
  try {
    const query = keywords.slice(0, 2).join(" ");
    const hnShowUrl = `https://hn.algolia.com/api/v1/search_by_date?tags=show_hn${query ? `&query=${encodeURIComponent(query)}` : ""}&hitsPerPage=50`;
    const res = await fetch(hnShowUrl, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = (await res.json()) as HnSearchResponse;
      for (const hit of data.hits ?? []) {
        const itemUrl = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`;
        if (seenUrls.has(itemUrl)) continue;
        seenUrls.add(itemUrl);

        const domain = cleanDomain(hit.url);
        const cleanName = hit.title.replace(/^Show HN:\s*/i, "").split(/[-–—:|]/)[0].trim();

        signals.push({
          id: `hn_${hit.objectID}`,
          companyName: cleanName || "Show HN Launch",
          domain,
          contactName: hit.author,
          contactTitle: "Founder / Builder",
          title: hit.title,
          snippet: (hit.story_text ? hit.story_text : hit.title).slice(0, 300),
          sourceUrl: itemUrl,
          platform: "hacker_news",
          signalType: "funding_expansion",
          intentScore: 85,
          detectedAt: hit.created_at,
          suggestedAngle: `Congratulate on recent launch: "${hit.title.slice(0, 70)}"`,
        });

        if (signals.length >= limit) break;
      }
    }
  } catch {
    // Continue gracefully
  }

  // 2. Hacker News: Ask HN (users asking for software recommendations)
  if (signals.length < limit) {
    try {
      const askQuery = keywords.length > 0 ? keywords[0] : "alternative to";
      const hnAskUrl = `https://hn.algolia.com/api/v1/search_by_date?tags=ask_hn&query=${encodeURIComponent(askQuery)}&hitsPerPage=10`;
      const res = await fetch(hnAskUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = (await res.json()) as HnSearchResponse;
        for (const hit of data.hits ?? []) {
          const itemUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;
          if (seenUrls.has(itemUrl)) continue;
          seenUrls.add(itemUrl);

          signals.push({
            id: `hn_ask_${hit.objectID}`,
            companyName: "Hacker News Buyer",
            domain: null,
            contactName: hit.author,
            contactTitle: "HN Community Member",
            title: hit.title,
            snippet: (hit.story_text ? hit.story_text : hit.title).slice(0, 300),
            sourceUrl: itemUrl,
            platform: "hacker_news",
            signalType: "tool_recommendation",
            intentScore: 90,
            detectedAt: hit.created_at,
            suggestedAngle: `Respond to Ask HN discussion: "${hit.title.slice(0, 70)}"`,
          });

          if (signals.length >= limit) break;
        }
      }
    } catch {
      // Continue gracefully
    }
  }

  // 3. YC launches (freshly funded startups)
  if (signals.length < limit) {
    try {
      const launches: CommunityLaunch[] = await ycLaunches(limit).catch(() => []);
      for (const launch of launches) {
        if (!launch.domain || seenUrls.has(launch.domain)) continue;
        seenUrls.add(launch.domain);

        signals.push({
          id: `yc_${launch.domain}`,
          companyName: launch.name,
          domain: launch.domain,
          contactName: null,
          contactTitle: "Founding Team",
          title: `${launch.name} - ${launch.tagline}`,
          snippet: `${launch.tagline} (YC ${launch.batch ?? "Launch"})`,
          sourceUrl: launch.sourceUrl,
          platform: "web",
          signalType: "funding_expansion",
          intentScore: 88,
          detectedAt: launch.date ?? new Date().toISOString(),
          suggestedAngle: `Reach out to newly funded YC batch company ${launch.name} (${launch.tagline})`,
        });

        if (signals.length >= limit) break;
      }
    } catch {
      // Continue gracefully
    }
  }

  return signals;
}
