/** Pure response parsers for each free source. No network, no `@/` imports, so node:test can run them on fixtures. */
import { stripHtml } from "./core.ts";
import type { RawSignal } from "./types.ts";

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === "object" ? (value as Json) : {});
const str = (value: unknown): string => (typeof value === "string" ? value : "");
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export function parseHnIntent(data: unknown): RawSignal[] {
  const out: RawSignal[] = [];
  for (const raw of arr(obj(data).hits)) {
    const hit = obj(raw);
    const id = str(hit.objectID);
    const title = str(hit.title) || str(hit.story_title);
    const body = stripHtml(str(hit.story_text) || str(hit.comment_text));
    if (!id || (!title && !body)) continue;
    out.push({
      source: "hn_intent",
      type: "buying_intent",
      entityName: null,
      domain: null,
      url: `https://news.ycombinator.com/item?id=${id}`,
      title: title || body.slice(0, 90),
      excerpt: body.slice(0, 600),
      author: str(hit.author) || null,
      eventAt: str(hit.created_at) || null,
    });
  }
  return out;
}

/** "Acme | Senior Engineer | Remote | $150k" -> "Acme". Skips replies that are not job posts. */
export function hiringCompanyName(commentText: string): string | null {
  const first = commentText.split(/\s*\|\s*/)[0]?.trim() ?? "";
  if (!commentText.includes("|") || first.length < 2 || first.length > 60) return null;
  return first.replace(/\s*\(.*?\)\s*$/, "").trim() || null;
}

export function parseHnHiring(data: unknown): RawSignal[] {
  const out: RawSignal[] = [];
  for (const raw of arr(obj(data).hits)) {
    const hit = obj(raw);
    const id = str(hit.objectID);
    const text = stripHtml(str(hit.comment_text));
    const company = hiringCompanyName(text);
    if (!id || !company) continue;
    out.push({
      source: "hn_hiring",
      type: "hiring",
      entityName: company,
      domain: null,
      url: `https://news.ycombinator.com/item?id=${id}`,
      title: `${company} is hiring`,
      excerpt: text.slice(0, 600),
      author: str(hit.author) || null,
      eventAt: str(hit.created_at) || null,
    });
  }
  return out;
}

const FUND_NAME = /\b(fund|l\.?p\.?|trust|partners|capital|holdings|acquisition|reit|series\s+[a-z]\s+(fund|l)|spv|investors?|portfolio|opportunit)\b/i;

/** SEC full-text search hits for form D. About two thirds are investment vehicles, so those are dropped by name. */
export function parseSecFormD(data: unknown): RawSignal[] {
  const hits = arr(obj(obj(data).hits).hits);
  const out: RawSignal[] = [];
  for (const raw of hits) {
    const hit = obj(raw);
    const src = obj(hit._source);
    const display = str(arr(src.display_names)[0]);
    const name = display.replace(/\s*\(CIK[^)]*\)\s*$/i, "").trim();
    const adsh = str(src.adsh);
    const cik = str(arr(src.ciks)[0]).replace(/^0+/, "");
    if (!name || !adsh || !cik || FUND_NAME.test(name)) continue;
    out.push({
      source: "sec_form_d",
      type: "funding",
      entityName: name,
      domain: null,
      url: `https://www.sec.gov/Archives/edgar/data/${cik}/${adsh.replace(/-/g, "")}/`,
      title: `${name} filed a Form D (new private funding)`,
      excerpt: `${name} told the SEC it sold securities in a private offering.`,
      author: null,
      eventAt: str(src.file_date) ? `${str(src.file_date)}T00:00:00Z` : null,
      meta: { adsh, cik },
    });
  }
  return out;
}

/** GDELT seendate is "20260115T123000Z". */
export function gdeltDate(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

export function parseGdelt(data: unknown): RawSignal[] {
  const out: RawSignal[] = [];
  for (const raw of arr(obj(data).articles)) {
    const a = obj(raw);
    const url = str(a.url);
    const title = str(a.title);
    if (!url || !title) continue;
    out.push({
      source: "gdelt_news",
      type: /\b(raises?|raised|funding|series [a-e]|seed round|secures?)\b/i.test(title) ? "funding" : "news",
      entityName: null,
      domain: null,
      url,
      title,
      excerpt: title,
      author: str(a.domain) || null,
      eventAt: gdeltDate(str(a.seendate)),
    });
  }
  return out;
}

export function parseBluesky(data: unknown): RawSignal[] {
  const out: RawSignal[] = [];
  for (const raw of arr(obj(data).posts)) {
    const post = obj(raw);
    const author = obj(post.author);
    const record = obj(post.record);
    const uri = str(post.uri);
    const handle = str(author.handle);
    const text = str(record.text);
    const rkey = uri.split("/").pop();
    if (!uri || !handle || !text || !rkey) continue;
    out.push({
      source: "bluesky",
      type: "buying_intent",
      entityName: null,
      domain: null,
      url: `https://bsky.app/profile/${handle}/post/${rkey}`,
      title: text.slice(0, 90),
      excerpt: text.slice(0, 600),
      author: str(author.displayName) || handle,
      eventAt: str(record.createdAt) || null,
    });
  }
  return out;
}

export function parseGithubIssues(data: unknown): RawSignal[] {
  const out: RawSignal[] = [];
  for (const raw of arr(obj(data).items)) {
    const item = obj(raw);
    const url = str(item.html_url);
    const title = str(item.title);
    if (!url || !title) continue;
    const repo = url.split("/").slice(3, 5).join("/");
    out.push({
      source: "github",
      type: "developer_activity",
      entityName: repo.split("/")[0] || null,
      domain: null,
      url,
      title,
      excerpt: str(item.body).slice(0, 600),
      author: str(obj(item.user).login) || null,
      eventAt: str(item.created_at) || null,
    });
  }
  return out;
}

export function parseDiscourse(data: unknown, host: string): RawSignal[] {
  const root = obj(data);
  const topics = new Map<number, Json>();
  for (const t of arr(root.topics)) topics.set(Number(obj(t).id), obj(t));
  const out: RawSignal[] = [];
  for (const raw of arr(root.posts)) {
    const post = obj(raw);
    const topic = topics.get(Number(post.topic_id));
    const slug = str(topic?.slug) || "topic";
    const title = str(topic?.title);
    if (!post.topic_id || !title) continue;
    out.push({
      source: "forums",
      type: "buying_intent",
      entityName: null,
      domain: null,
      url: `https://${host}/t/${slug}/${post.topic_id}/${post.post_number ?? 1}`,
      title,
      excerpt: stripHtml(str(post.blurb)).slice(0, 600),
      author: str(post.username) || null,
      eventAt: str(post.created_at) || null,
      meta: { forum: host },
    });
  }
  return out;
}

export function parseStackExchange(data: unknown, site: string): RawSignal[] {
  const out: RawSignal[] = [];
  for (const raw of arr(obj(data).items)) {
    const item = obj(raw);
    const url = str(item.link);
    const title = stripHtml(str(item.title));
    if (!url || !title) continue;
    const created = Number(item.creation_date);
    out.push({
      source: "forums",
      type: "buying_intent",
      entityName: null,
      domain: null,
      url,
      title,
      excerpt: title,
      author: str(obj(item.owner).display_name) || null,
      eventAt: Number.isFinite(created) && created > 0 ? new Date(created * 1000).toISOString() : null,
      meta: { forum: `stackexchange:${site}` },
    });
  }
  return out;
}

export function parseLemmy(data: unknown, host: string): RawSignal[] {
  const out: RawSignal[] = [];
  for (const raw of arr(obj(data).posts)) {
    const entry = obj(raw);
    const post = obj(entry.post);
    const url = str(post.ap_id);
    const title = str(post.name);
    if (!url || !title) continue;
    out.push({
      source: "forums",
      type: "buying_intent",
      entityName: null,
      domain: null,
      url,
      title,
      excerpt: str(post.body).slice(0, 600),
      author: str(obj(entry.creator).name) || null,
      eventAt: str(post.published) || null,
      meta: { forum: `lemmy:${host}` },
    });
  }
  return out;
}

/** Greenhouse, Lever and Ashby job-board payloads -> one hiring signal per matching open role. */
export function parseAtsJobs(ats: "greenhouse" | "lever" | "ashby", slug: string, data: unknown, roleTerms: string[]): RawSignal[] {
  type Job = { title: string; url: string; at: string | null };
  const jobs: Job[] = [];
  if (ats === "greenhouse") {
    for (const raw of arr(obj(data).jobs)) {
      const j = obj(raw);
      jobs.push({ title: str(j.title), url: str(j.absolute_url), at: str(j.updated_at) || null });
    }
  } else if (ats === "lever") {
    for (const raw of arr(data)) {
      const j = obj(raw);
      const created = Number(j.createdAt);
      jobs.push({ title: str(j.text), url: str(j.hostedUrl), at: Number.isFinite(created) && created > 0 ? new Date(created).toISOString() : null });
    }
  } else {
    for (const raw of arr(obj(data).jobs)) {
      const j = obj(raw);
      jobs.push({ title: str(j.title), url: str(j.jobUrl), at: str(j.publishedAt) || null });
    }
  }
  const terms = roleTerms.map((term) => term.toLowerCase()).filter(Boolean);
  const out: RawSignal[] = [];
  for (const job of jobs) {
    if (!job.title || !job.url) continue;
    if (terms.length > 0 && !terms.some((term) => job.title.toLowerCase().includes(term))) continue;
    out.push({
      source: "ats_hiring",
      type: "hiring",
      entityName: slug,
      domain: null,
      url: job.url,
      title: `${slug} is hiring: ${job.title}`,
      excerpt: job.title,
      author: null,
      eventAt: job.at,
      meta: { ats, slug },
    });
  }
  return out;
}
