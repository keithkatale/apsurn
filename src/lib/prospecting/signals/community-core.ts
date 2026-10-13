/** Pure helpers for the community-signal collectors. No runtime `@/` imports so they run under node:test. */
import type { CommunityLaunch, LaunchSource } from "../sources/community";
import type { SignalCandidate } from "./types";

export interface RelevanceItem {
  idx: number;
  name: string;
  domain: string;
  tagline: string;
  source: LaunchSource;
  tags: string[];
}

const SOURCE_LABEL: Record<LaunchSource, string> = {
  yc_launches: "Launch YC",
  yc_batch: "Y Combinator",
  hn_show: "Hacker News",
  product_hunt: "Product Hunt",
  betalist: "BetaList",
};

export function sourceLabel(source: LaunchSource): string {
  return SOURCE_LABEL[source];
}

/** The model decides who plausibly needs what we sell, from public facts only. */
export function buildRelevancePrompt(items: RelevanceItem[], context: { productSummary?: string | null; keywords?: string[] }): string {
  const lines = items
    .map((item) => `${item.idx}. ${item.name} (${item.domain}) via ${sourceLabel(item.source)}: ${item.tagline.slice(0, 200)}${item.tags.length ? ` [${item.tags.slice(0, 4).join(", ")}]` : ""}`)
    .join("\n");
  return `We sell: ${context.productSummary?.trim() || "(not specified; keep companies that look like B2B software or services businesses)"}.
${context.keywords?.length ? `Topics to prefer: ${context.keywords.join(", ")}.\n` : ""}Below are companies that publicly launched a product, joined an accelerator, or announced something recently. Decide which would plausibly NEED or BUY what we sell.

Rules:
- Use only the text given for each company. Never use outside knowledge and never invent facts about a company.
- Drop consumer apps, games, hobby projects, and companies that are direct competitors of what we sell.
- Keep a company only if a reason to contact them follows from what they just did (for example: a brand-new product that needs its first customers).
- "why" is one short sentence (at most 16 words) that ties their public activity to our offer.

Companies:
${lines}

Reply with ONLY JSON: {"keep":[{"idx":1,"why":"..."}]}`;
}

/** idx -> why for the companies the model kept. Returns null when the reply isn't usable JSON. */
export function parseRelevance(text: string, validIdx: number[]): Map<number, string> | null {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  const keep = parsed && typeof parsed === "object" ? (parsed as { keep?: unknown }).keep : null;
  if (!Array.isArray(keep)) return null;
  const valid = new Set(validIdx);
  const out = new Map<number, string>();
  for (const row of keep) {
    const item = row && typeof row === "object" ? (row as { idx?: unknown; why?: unknown }) : null;
    const idx = typeof item?.idx === "number" ? item.idx : NaN;
    if (!valid.has(idx)) continue;
    out.set(idx, typeof item?.why === "string" ? item.why.trim().slice(0, 160) : "");
  }
  return out;
}

export function launchHeadline(launch: CommunityLaunch, why: string): string {
  const base =
    launch.source === "yc_batch"
      ? `Joined Y Combinator ${launch.batch ?? ""}`.trim()
      : launch.source === "yc_launches"
        ? `Launched on Launch YC${launch.batch ? ` (${launch.batch})` : ""}`
        : launch.source === "hn_show"
          ? "Launched on Hacker News (Show HN)"
          : launch.source === "product_hunt"
            ? "Launched on Product Hunt"
            : "Listed on BetaList";
  return why ? `${base}: ${why}` : base;
}

/** One signal candidate from a public launch or accelerator entry. */
export function candidateFromLaunch(launch: CommunityLaunch, why: string, triggerType: "launch" | "accelerator"): SignalCandidate {
  return {
    companyName: launch.name,
    domain: launch.domain,
    triggerType,
    headline: launchHeadline(launch, why),
    sourceUrl: launch.sourceUrl,
    excerpt: launch.tagline || launch.name,
    eventDate: launch.date,
    strength: launch.strength,
    industry: launch.tags[0] ?? null,
    location: null,
    companySize: launch.teamSize ?? null,
  };
}

/** Keeps the strongest entry per domain and drops anything already known. */
export function dedupeLaunches(launches: CommunityLaunch[], known: Set<string>): CommunityLaunch[] {
  const best = new Map<string, CommunityLaunch>();
  for (const launch of launches) {
    const domain = launch.domain.toLowerCase();
    if (known.has(domain)) continue;
    const current = best.get(domain);
    if (!current || launch.strength > current.strength) best.set(domain, launch);
  }
  return [...best.values()];
}

/** Keeps entries whose text mentions any of the keywords (all pass when none are given). */
export function matchesKeywords(launch: CommunityLaunch, keywords: string[] | undefined): boolean {
  if (!keywords?.length) return true;
  const text = `${launch.name} ${launch.tagline} ${launch.tags.join(" ")}`.toLowerCase();
  return keywords.some((keyword) => text.includes(keyword.toLowerCase().trim()));
}
