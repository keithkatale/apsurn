/**
 * Context-based signal collectors that need no paid API and no lead database:
 *
 *  - launch: a company launched something in public (Launch YC, Show HN, Product Hunt, BetaList).
 *  - accelerator: a company was newly admitted to a Y Combinator batch.
 *
 * Each entry carries a date, the company's own website and a link to where it said so. A model then judges, from the
 * public tagline alone, whether the company plausibly needs what the user sells, and writes the one-line reason.
 */
import { getAiClient } from "@/lib/ai/openai";
import { betaListLaunches, hnShowLaunches, productHuntLaunches, productHuntMakers, ycCompanyFounders, ycLaunches, ycNewBatchCompanies, type CommunityLaunch } from "../sources/community";
import type { ProspectCriteria, TriggerSpec } from "../types";
import { buildRelevancePrompt, candidateFromLaunch, dedupeLaunches, matchesKeywords, parseRelevance, type RelevanceItem } from "./community-core";
import type { SignalCandidate } from "./types";

const BATCH = 30;
const MAX_CONSIDERED = 150;
/** No single source may crowd out the others: BetaList has no dates, so it would otherwise always sort first. */
const MAX_PER_SOURCE = 40;
const FOUNDER_LOOKUP_CONCURRENCY = 4;
const DAY_MS = 86_400_000;

async function settled(label: string, work: Promise<CommunityLaunch[]>): Promise<CommunityLaunch[]> {
  try {
    return await work;
  } catch (error) {
    // One source being down must never discard what the others found.
    console.warn(`[signals] ${label} source failed:`, error instanceof Error ? error.message : error);
    return [];
  }
}

/** Which of these companies plausibly need the user's product, with a one-line reason each. Unusable replies keep the batch. */
async function judgeRelevance(launches: CommunityLaunch[], productSummary: string | null | undefined, keywords: string[] | undefined): Promise<Array<{ launch: CommunityLaunch; why: string }>> {
  let ai: Awaited<ReturnType<typeof getAiClient>>;
  try {
    ai = await getAiClient();
  } catch (error) {
    console.warn("[signals] relevance pass skipped (no AI client):", error instanceof Error ? error.message : error);
    return launches.map((launch) => ({ launch, why: "" }));
  }
  const kept: Array<{ launch: CommunityLaunch; why: string }> = [];
  for (let offset = 0; offset < launches.length; offset += BATCH) {
    const batch = launches.slice(offset, offset + BATCH);
    const items: RelevanceItem[] = batch.map((launch, i) => ({ idx: i + 1, name: launch.name, domain: launch.domain, tagline: launch.tagline, source: launch.source, tags: launch.tags }));
    try {
      const response = await ai.ai.responses.create({
        model: ai.model,
        max_output_tokens: 2000,
        text: { format: { type: "json_object" } },
        input: buildRelevancePrompt(items, { productSummary, keywords }),
      });
      const verdicts = parseRelevance(String(response.output_text ?? ""), items.map((item) => item.idx));
      if (!verdicts) {
        console.warn("[signals] relevance reply unusable; keeping this batch unfiltered");
        batch.forEach((launch) => kept.push({ launch, why: "" }));
        continue;
      }
      batch.forEach((launch, i) => {
        const why = verdicts.get(i + 1);
        if (why !== undefined) kept.push({ launch, why });
      });
    } catch (error) {
      console.warn("[signals] relevance call failed; keeping this batch unfiltered:", error instanceof Error ? error.message : error);
      batch.forEach((launch) => kept.push({ launch, why: "" }));
    }
  }
  return kept;
}

function newestFirst(a: CommunityLaunch, b: CommunityLaunch): number {
  return Date.parse(b.date ?? "") - Date.parse(a.date ?? "") || b.strength - a.strength;
}

/** Keeps at most `max` per source, newest first within each. */
function capPerSource(launches: CommunityLaunch[], max: number): CommunityLaunch[] {
  const counts = new Map<string, number>();
  return [...launches].sort(newestFirst).filter((launch) => {
    const n = counts.get(launch.source) ?? 0;
    counts.set(launch.source, n + 1);
    return n < max;
  });
}

/** Takes one from each source in turn, so the final list mixes launches, batches, Show HN and Product Hunt. */
function interleaveBySource<T extends { launch: CommunityLaunch }>(rows: T[], limit: number): T[] {
  const bySource = new Map<string, T[]>();
  for (const row of rows) bySource.set(row.launch.source, [...(bySource.get(row.launch.source) ?? []), row]);
  const lists = [...bySource.values()];
  const out: T[] = [];
  for (let i = 0; out.length < limit && lists.some((list) => list[i]); i++) {
    for (const list of lists) {
      if (list[i] && out.length < limit) out.push(list[i]);
    }
  }
  return out;
}

/** Y Combinator companies list their founders publicly, and Product Hunt names a product's makers: attach that person as the one to contact. */
async function withFounderHints(launches: Array<{ launch: CommunityLaunch; why: string }>, trigger: "launch" | "accelerator", shouldStop: () => boolean): Promise<SignalCandidate[]> {
  const candidates = launches.map(({ launch, why }) => candidateFromLaunch(launch, why, trigger));
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(FOUNDER_LOOKUP_CONCURRENCY, candidates.length) }, async () => {
      for (;;) {
        if (shouldStop()) return;
        const index = cursor++;
        if (index >= candidates.length) return;
        const { ycSlug, source, sourceUrl } = launches[index].launch;
        try {
          if (ycSlug) {
            const founder = (await ycCompanyFounders(ycSlug))[0];
            if (founder) candidates[index].personHint = { name: founder.name, title: founder.title, profileUrl: founder.linkedinUrl };
          } else if (source === "product_hunt") {
            const maker = (await productHuntMakers(sourceUrl))[0];
            if (maker) candidates[index].personHint = { name: maker, title: "Founder / maker", profileUrl: null };
          }
        } catch {
          // No founder listed: the website path will look for a person instead.
        }
      }
    }),
  );
  return candidates;
}

interface CollectArgs {
  criteria: ProspectCriteria;
  spec: TriggerSpec;
  known: Set<string>;
  want: number;
  productSummary?: string | null;
  shouldStop: () => boolean;
}

/** Companies that launched something in public lately and plausibly need what the user sells. */
export async function collectLaunchSignals(opts: CollectArgs): Promise<SignalCandidate[]> {
  const { spec, known, want, shouldStop } = opts;
  const days = spec.recencyDays;
  const groups = await Promise.all([
    settled("Launch YC", ycLaunches(days)),
    settled("Show HN", hnShowLaunches(days)),
    settled("Product Hunt", productHuntLaunches(days)),
    settled("BetaList", betaListLaunches()),
  ]);
  if (shouldStop()) return [];

  const cutoff = Date.now() - days * DAY_MS;
  const pool = capPerSource(
    dedupeLaunches(groups.flat(), known)
      .filter((launch) => matchesKeywords(launch, spec.keywords))
      .filter((launch) => !launch.date || Date.parse(launch.date) >= cutoff),
    MAX_PER_SOURCE,
  ).slice(0, MAX_CONSIDERED);
  if (pool.length === 0) return [];

  const judged = await judgeRelevance(pool, opts.productSummary, spec.keywords);
  return withFounderHints(interleaveBySource(judged, Math.max(want, 1)), "launch", shouldStop);
}

/** Companies newly admitted to a Y Combinator batch: early, funded, and building their first sales motion. */
export async function collectAcceleratorSignals(opts: CollectArgs): Promise<SignalCandidate[]> {
  const { spec, known, want, shouldStop } = opts;
  const batch = await settled("Y Combinator batches", ycNewBatchCompanies(spec.recencyDays));
  if (shouldStop()) return [];
  const pool = dedupeLaunches(batch, known)
    .filter((launch) => matchesKeywords(launch, spec.keywords))
    // The batches are large; hiring ones are actively building a team, so they go to the model first.
    .sort((a, b) => Number(Boolean(b.isHiring)) - Number(Boolean(a.isHiring)) || b.strength - a.strength)
    .slice(0, MAX_CONSIDERED);
  if (pool.length === 0) return [];
  const judged = await judgeRelevance(pool, opts.productSummary, spec.keywords);
  return withFounderHints(judged.slice(0, Math.max(want, 1)), "accelerator", shouldStop);
}
