/**
 * Pure logic for the social-pain trigger: pulling a company out of a profile
 * headline, asking a model to judge posts, and parsing its verdicts. No
 * runtime imports (social.test.ts).
 */

/** Words that follow "at"/"@" in a headline but name no employer. */
const NOT_A_COMPANY = /^(home|the moment|work|my own|self|freelanc|independent|stealth|various|multiple|your|a |an |the |scale|building|helping|leading|growing|everyone|anyone|best|top|#|\d)/i;

/**
 * "Co-founder at Acme | helping X" -> "Acme". Only an explicit "at"/"@"/"of"
 * counts; marketing blurbs ("I turn cold outreach into booked calls") yield
 * null, which is correct — we never guess an employer.
 */
export function companyFromHeadline(info: string | null | undefined): string | null {
  if (!info) return null;
  for (const segment of info.split(/[|•·\n]|\.\s/)) {
    const match = segment.match(/(?:\bat|@|\b(?:[Ff]ounder|[Cc]o-?[Ff]ounder|CEO|CTO|COO|[Oo]wner|[Pp]resident)\s+of)\s*([A-Z][\w&'’.\-]*(?:\s+[A-Z&][\w&'’.\-]*){0,3})/);
    const name = match?.[1]?.replace(/[.,;:!-]+$/, "").trim();
    if (!name || name.length < 2 || name.length > 40 || NOT_A_COMPANY.test(name)) continue;
    return name;
  }
  return null;
}

export interface PostItem {
  idx: number;
  author: string | null;
  headline: string | null;
  text: string;
}

export interface PainVerdict {
  /** The author describes a problem they themselves have right now — not advice, a pitch, or a story about a client. */
  pain: boolean;
  summary: string;
  /** A company the post or headline explicitly says the author works for or runs; null when not stated. */
  company: string | null;
}

export function buildPainPrompt(posts: PostItem[], topic: string): string {
  const lines = posts
    .map((post) => `${post.idx}. author: ${post.author ?? "unknown"}${post.headline ? ` (${post.headline.slice(0, 120)})` : ""}\n   post: ${post.text.slice(0, 500).replace(/\s+/g, " ")}`)
    .join("\n");
  return `You are screening social posts for a B2B sales team that sells a tool for: ${topic}.
For each numbered post decide whether the AUTHOR is a potential buyer who is expressing a problem THEY have right now that this tool addresses.

pain = true only if the author speaks in the first person about their own current problem or frustration.
pain = false for: advice or tips, thought leadership, a pitch or promotion of their own service, a story about a client, a motivational post, a question aimed at the audience in general, or anything where the author sells in this space.
"company": a company name only if the post text or the headline explicitly says the author works for or runs it. Otherwise null. Never guess.
"summary": under 15 words, in your own words, of the problem they describe.

Posts:
${lines}

Reply with ONLY JSON: {"verdicts":[{"i":1,"pain":false,"summary":"","company":null}]} covering every number.`;
}

export function parsePainVerdicts(text: string, expected: number[]): Map<number, PainVerdict> | null {
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
  const verdicts = (parsed as { verdicts?: unknown } | null)?.verdicts;
  if (!Array.isArray(verdicts)) return null;

  const allowed = new Set(expected);
  const out = new Map<number, PainVerdict>();
  for (const row of verdicts) {
    const v = row && typeof row === "object" ? (row as Record<string, unknown>) : null;
    const idx = Number(v?.i);
    if (!v || !allowed.has(idx)) continue;
    const company = typeof v.company === "string" ? v.company.trim() : "";
    out.set(idx, {
      pain: v.pain === true,
      summary: typeof v.summary === "string" ? v.summary.trim().slice(0, 160) : "",
      company: company && company.length <= 60 && !/^(null|none|unknown|n\/a)$/i.test(company) ? company : null,
    });
  }
  return out.size >= Math.ceil(expected.length / 2) ? out : null;
}

/** Likes + comments as a [0, 1] strength: a post people reacted to is a stronger signal than one nobody saw. */
export function engagementStrength(likes: number | null | undefined, comments: number | null | undefined): number {
  const total = (likes ?? 0) + 3 * (comments ?? 0);
  return Math.min(1, 0.3 + Math.log10(1 + total) / 3);
}
