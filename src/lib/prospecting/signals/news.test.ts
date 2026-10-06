import test from "node:test";
import assert from "node:assert/strict";
import {
  articleDate,
  buildNewsQueries,
  dateFromUrl,
  formatAmount,
  monthFromUrl,
  monthsInWindow,
  parseProposedEvents,
  publishedDateFromHtml,
  validateEvents,
  type NewsResult,
  type ProposedEvent,
} from "./news-core.ts";

const NOW = new Date("2026-10-05T12:00:00Z");
const results: NewsResult[] = [
  { url: "https://techcrunch.com/2026/10/01/acme-raises-12m-series-a", title: "Acme raises $12M Series A", snippet: "Acme, which builds routing software, raised a $12M Series A led by Foo Ventures." },
  { url: "https://example.com/blog/funding-roundup", title: "Funding roundup: top 10 rounds this week", snippet: "Acme, Zenith and Orbit all raised." },
  { url: "https://news.example.com/", title: "Acme news", snippet: "Acme raised money." },
  { url: "https://news.example.com/2026/09/20/zenith-launch", title: "Zenith launches new product", snippet: "Zenith launched Atlas today." },
  { url: "https://news.example.com/stories/orbit-raises-seed", title: "Orbit raises seed round", snippet: "Orbit raised a seed round." },
  { url: "https://news.example.com/2026/10/borealis-series-a", title: "Borealis raises Series A", snippet: "Borealis raised a Series A." },
];
// `date` is deliberately ignored by the validator: models fill in "today" when a snippet has no date.
const ev = (over: Partial<ProposedEvent>): ProposedEvent => ({ company: "Acme", event: "Raised a Series A", kind: "funding", amount: "$12M", date: "2026-10-05", sourceIndex: 1, ...over });

test("accepts an event whose cited page names the company and whose URL carries a recent date", () => {
  const valid = validateEvents([ev({})], results, 30, NOW);
  assert.equal(valid.length, 1);
  assert.equal(valid[0].headline, "Raised a Series A ($12M)");
  assert.equal(valid[0].date, "2026-10-01T00:00:00.000Z");
  assert.equal(valid[0].sourceUrl, results[0].url);
});

test("a model-written date never rescues an undated article", () => {
  assert.equal(validateEvents([ev({ company: "Orbit", date: "2026-10-05", sourceIndex: 5 })], results, 30, NOW).length, 0);
});

test("page metadata supplies the date when the URL has none", () => {
  const published = new Map([[results[4].url, Date.parse("2026-09-28T09:00:00Z")]]);
  assert.equal(validateEvents([ev({ company: "Orbit", sourceIndex: 5 })], results, 30, NOW, published).length, 1);
  const stale = new Map([[results[4].url, Date.parse("2026-06-01T09:00:00Z")]]);
  assert.equal(validateEvents([ev({ company: "Orbit", sourceIndex: 5 })], results, 30, NOW, stale).length, 0);
});

test("rejects: company absent from the cited page, stale article, roundup, homepage, bad index", () => {
  assert.equal(validateEvents([ev({ company: "Orbit" })], results, 30, NOW).length, 0);
  assert.equal(validateEvents([ev({ company: "Zenith", kind: "launch", sourceIndex: 4 })], results, 5, NOW).length, 0);
  assert.equal(validateEvents([ev({ sourceIndex: 2 })], results, 30, NOW).length, 0);
  assert.equal(validateEvents([ev({ sourceIndex: 3 })], results, 30, NOW).length, 0);
  assert.equal(validateEvents([ev({ sourceIndex: 99 })], results, 30, NOW).length, 0);
});

test("a month-only URL counts as the first of that month: kept inside the window, dropped outside", () => {
  assert.equal(monthFromUrl(results[5].url), Date.UTC(2026, 9, 1));
  assert.equal(validateEvents([ev({ company: "Borealis", sourceIndex: 6 })], results, 30, NOW).length, 1);
  const lateNow = new Date("2026-11-20T12:00:00Z");
  assert.equal(validateEvents([ev({ company: "Borealis", sourceIndex: 6 })], results, 30, lateNow).length, 0);
});

test("one event per company and kind; a different kind for the same company is kept", () => {
  const valid = validateEvents([ev({}), ev({ event: "Raised $12M" }), ev({ kind: "launch", event: "Launched Atlas" })], results, 30, NOW);
  assert.deepEqual(valid.map((e) => e.kind), ["funding", "launch"]);
});

test("date sources: full URL date beats page metadata, which beats month-only", () => {
  assert.equal(dateFromUrl("https://techcrunch.com/2026/10/01/acme"), Date.UTC(2026, 9, 1));
  assert.equal(dateFromUrl("https://www.morningstar.com/news/pr-newswire/20261005ph62853/signsplit"), Date.UTC(2026, 9, 5));
  assert.equal(dateFromUrl("https://site.com/news/acme-raises"), null);
  assert.equal(articleDate("https://a.com/2026/10/01/x", 5), Date.UTC(2026, 9, 1));
  assert.equal(articleDate("https://a.com/2026/10/x", 7), 7);
  assert.equal(articleDate("https://a.com/2026/10/x", null), Date.UTC(2026, 9, 1));
  assert.equal(articleDate("https://a.com/x", null), null);
});

test("reads the publication date from common metadata shapes", () => {
  const iso = "2026-09-28T09:00:00Z";
  const want = Date.parse(iso);
  assert.equal(publishedDateFromHtml(`<meta property="article:published_time" content="${iso}">`), want);
  assert.equal(publishedDateFromHtml(`<meta content="${iso}" property="article:published_time"/>`), want);
  assert.equal(publishedDateFromHtml(`<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"${iso}"}</script>`), want);
  assert.equal(publishedDateFromHtml(`<time datetime="${iso}">Sept 28</time>`), want);
  assert.equal(publishedDateFromHtml("<html><body>no dates</body></html>"), null);
});

test("amounts: strings pass through, bare numbers are shown compactly", () => {
  assert.equal(formatAmount("$12M"), "$12M");
  assert.equal(formatAmount(42_000_000), "$42M");
  assert.equal(formatAmount(180_000), "$180K");
  assert.equal(formatAmount(1_500_000_000), "$1.5B");
  assert.equal(formatAmount(null), null);
  assert.equal(formatAmount(-5), null);
});

test("parseProposedEvents tolerates fences, keeps numeric amounts, and drops malformed rows", () => {
  const parsed = parseProposedEvents('```json\n{"events":[{"company":"Acme","event":"Raised","amount":12000000,"date":"2026-10-01","sourceIndex":1},{"company":"X"},{"company":"Y","event":"Z","sourceIndex":0}]}\n```');
  assert.equal(parsed?.length, 1);
  assert.equal(parsed?.[0].amount, "$12M");
  assert.equal(parseProposedEvents("nope"), null);
});

test("queries name the months in the window and respect the event kinds", () => {
  assert.deepEqual(monthsInWindow(NOW, 30).slice(0, 2), ["October 2026", "September 2026"]);
  const queries = buildNewsQueries({ industries: ["fintech"], keywords: [], eventKinds: ["funding", "exec_hire"], now: NOW, recencyDays: 30 });
  assert.ok(queries.length > 0 && queries.length <= 6);
  assert.ok(queries.some((q) => /raises funding/.test(q)) && queries.some((q) => /Chief Revenue Officer/.test(q)));
  assert.ok(queries.every((q) => /2026/.test(q)));
});

test("roundup slugs are rejected even when the title looks like a single company", () => {
  const roundups: NewsResult[] = [
    { url: "https://alleywatch.com/2026/10/the-weekly-notable-startup-funding-report-10-5-26/", title: "Ascerta raises $18M", snippet: "Ascerta raised $18M." },
    { url: "https://substack.com/p/robotics-funding-rounds-by-month-555", title: "Maven Robotics raises", snippet: "Maven Robotics raised $100M." },
    { url: "https://site.com/2026/10/01/top-10-ai-security-startups-with-the-largest-rounds", title: "Glow raises $180M", snippet: "Glow raised $180M." },
    { url: "https://fintech.global/2026/10/02/smaller-deals-dominated-this-weeks-fintech-deal-scene-with-541m-raised-across-15-deals/", title: "Armadin raises $255.5M", snippet: "Armadin raised $255.5M Series B." },
  ];
  for (const [i, company] of ["Ascerta", "Maven Robotics", "Glow", "Armadin"].entries()) {
    assert.equal(validateEvents([ev({ company, sourceIndex: i + 1 })], roundups, 30, NOW).length, 0, company);
  }
});
