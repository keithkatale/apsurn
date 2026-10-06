import { getAiClient } from "@/lib/ai/openai";
import { ACTORS, asIsoDate, asNumber, asString, runApifyActor } from "@/lib/market/apify";
import type { ProspectCriteria, TriggerSpec } from "../types";
import { resolveCompanyDomain } from "./domain";
import { filterByIcpFit } from "./fit";
import { buildPainPrompt, companyFromHeadline, engagementStrength, parsePainVerdicts, type PostItem } from "./social-core";
import type { SignalCandidate } from "./types";

const MAX_POSTS_PER_QUERY = 15;
const MAX_QUERIES = 3;
const JUDGE_BATCH = 20;
const DOMAIN_LOOKUP_CONCURRENCY = 4;

interface LinkedInPost {
  type?: string;
  linkedinUrl?: string;
  url?: string;
  content?: string;
  author?: { name?: string; publicIdentifier?: string; linkedinUrl?: string; info?: string };
  postedAt?: { date?: string; timestamp?: number };
  engagement?: { likes?: number; comments?: number };
}

interface Post extends PostItem {
  url: string;
  postedAt: string | null;
  likes?: number;
  comments?: number;
  profileUrl: string | null;
}

/** People publicly describing a problem the user's product solves, tied to the company they work for. */
export async function collectSocialSignals(opts: {
  criteria: ProspectCriteria;
  spec: TriggerSpec;
  known: Set<string>;
  want: number;
  productSummary?: string | null;
  shouldStop: () => boolean;
}): Promise<SignalCandidate[]> {
  const { criteria, spec, known, shouldStop } = opts;
  const queries = (spec.keywords?.length ? spec.keywords : criteria.industries).slice(0, MAX_QUERIES);
  if (queries.length === 0) return [];
  const topic = opts.productSummary?.trim() || spec.keywords?.join(", ") || criteria.industries.join(", ");
  const postedLimit = spec.recencyDays <= 7 ? "week" : spec.recencyDays <= 31 ? "month" : "3months";

  const posts: Post[] = [];
  const seen = new Set<string>();
  for (const query of queries) {
    if (shouldStop()) break;
    let items: LinkedInPost[] = [];
    try {
      items = await runApifyActor<LinkedInPost>(ACTORS.linkedinSearch, {
        searchQueries: [query.trim().slice(0, 85)],
        maxPosts: MAX_POSTS_PER_QUERY,
        sortBy: "date",
        postedLimit,
        scrapeComments: false,
        scrapeReactions: false,
      });
    } catch (error) {
      console.warn(`[signals] social search "${query}" failed:`, error instanceof Error ? error.message : error);
      continue;
    }
    for (const item of items) {
      const url = asString(item.linkedinUrl) || asString(item.url);
      const text = (asString(item.content) || "").trim();
      if ((item.type && item.type !== "post") || !url || text.length < 40 || seen.has(url)) continue;
      seen.add(url);
      posts.push({
        idx: posts.length + 1,
        url,
        text,
        author: asString(item.author?.name),
        headline: asString(item.author?.info),
        profileUrl: asString(item.author?.linkedinUrl),
        postedAt: asIsoDate(item.postedAt?.date) || asIsoDate(item.postedAt?.timestamp),
        likes: asNumber(item.engagement?.likes),
        comments: asNumber(item.engagement?.comments),
      });
    }
  }
  if (posts.length === 0 || shouldStop()) return [];

  // One batched judgement per ~20 posts, thinking off so the JSON reply isn't starved.
  const { ai, model } = await getAiClient();
  const pains: Array<{ post: Post; summary: string; company: string | null }> = [];
  for (let i = 0; i < posts.length && !shouldStop(); i += JUDGE_BATCH) {
    const batch = posts.slice(i, i + JUDGE_BATCH);
    const response = await ai.responses.create({
      model,
      thinking_budget: 0,
      max_output_tokens: 2500,
      text: { format: { type: "json_object" } },
      input: buildPainPrompt(batch, topic),
    });
    const verdicts = parsePainVerdicts(String(response.output_text ?? ""), batch.map((post) => post.idx));
    if (!verdicts) {
      console.warn("[signals] social pain verdicts unusable");
      continue;
    }
    for (const post of batch) {
      const verdict = verdicts.get(post.idx);
      if (verdict?.pain) pains.push({ post, summary: verdict.summary, company: verdict.company ?? companyFromHeadline(post.headline) });
    }
  }

  console.info(`[signals] social: ${posts.length} posts, ${pains.length} pain, ${pains.filter((pain) => pain.company).length} with a company`);

  // Anonymous or employer-less authors are dropped: no company means no lead, and we never guess one.
  const withCompany = pains.filter((pain) => pain.company);
  const out: SignalCandidate[] = [];
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(DOMAIN_LOOKUP_CONCURRENCY, withCompany.length) }, async () => {
      for (;;) {
        if (shouldStop()) return;
        const pain = withCompany[cursor++];
        if (!pain) return;
        const domain = await resolveCompanyDomain(pain.company as string);
        if (!domain || known.has(domain)) continue;
        out.push({
          companyName: pain.company as string,
          domain,
          triggerType: "social_pain",
          headline: `${pain.post.author ?? "A decision maker"} posted: ${pain.summary || "describes a current pain"}`,
          sourceUrl: pain.post.url,
          excerpt: pain.post.text.slice(0, 300),
          eventDate: pain.post.postedAt,
          personHint: { name: pain.post.author, title: null, profileUrl: pain.post.profileUrl },
          strength: engagementStrength(pain.post.likes, pain.post.comments),
          industry: null,
          location: null,
          companySize: null,
        });
      }
    }),
  );

  const byDomain = new Map<string, SignalCandidate>();
  for (const candidate of out) if (candidate.domain && !byDomain.has(candidate.domain)) byDomain.set(candidate.domain, candidate);
  return filterByIcpFit([...byDomain.values()], criteria, opts.productSummary);
}
