import assert from "node:assert/strict";
import { test } from "node:test";
import {
  batchStartDate,
  companyDomainFromUrl,
  parseAtomEntries,
  parseBetaListHome,
  parseHiringComment,
  parsePhMakers,
  parseShowHnTitle,
  parseYcFounders,
  recentBatches,
} from "./community-parse.ts";

test("company domains exclude stores, repos, hosting subdomains and job boards", () => {
  assert.equal(companyDomainFromUrl("https://www.acme.com/pricing"), "acme.com");
  assert.equal(companyDomainFromUrl("https://github.com/acme/app"), null);
  assert.equal(companyDomainFromUrl("https://acme.vercel.app"), null);
  assert.equal(companyDomainFromUrl("https://apps.apple.com/app/x"), null);
  assert.equal(companyDomainFromUrl("https://grnh.se/abc123"), null);
  assert.equal(companyDomainFromUrl("https://boards.greenhouse.io/acme"), null);
  assert.equal(companyDomainFromUrl("not a url"), null);
  assert.equal(companyDomainFromUrl(null), null);
});

test("Show HN titles become a name and a tagline", () => {
  assert.deepEqual(parseShowHnTitle("Show HN: Rezoom – one chat list for all your Claude Code sessions"), {
    name: "Rezoom",
    tagline: "one chat list for all your Claude Code sessions",
  });
  assert.deepEqual(parseShowHnTitle("Launch HN: Maritime (YC F26) – Cloud for AI agents"), { name: "Maritime (YC F26)", tagline: "Cloud for AI agents" });
  assert.equal(parseShowHnTitle("Ask HN: something else"), null);
});

test("Who is hiring posts parse company, roles, location and the company's own site", () => {
  const post = parseHiringComment(
    'Acme (YC W21) | Founding Account Executive | Remote (US) | <a href="https://acme.com/jobs" rel="nofollow">https://acme.com/jobs</a><p>We sell widgets.',
  );
  assert.equal(post?.company, "Acme");
  assert.match(post?.roles ?? "", /Founding Account Executive/);
  assert.equal(post?.url, "https://acme.com/jobs");
  assert.equal(parseHiringComment("Thanks, I applied!"), null);
  // A company that names its own domain wins over an ATS link.
  const named = parseHiringComment("Chronograph (chronograph.pe) | Platform Engineer | NYC | https://grnh.se/xyz");
  assert.equal(named?.company, "Chronograph");
  assert.equal(named?.url, "https://chronograph.pe");
});

test("Atom entries yield title, link, date, summary and the outbound product link", () => {
  const xml = `<feed><entry><published>2026-10-05T07:55:26-07:00</published><link rel="alternate" type="text/html" href="https://www.producthunt.com/products/tori"/><title>Tori</title><content type="html">&lt;p&gt; Japanese listening practice &lt;/p&gt; &lt;p&gt;&lt;a href="https://www.producthunt.com/products/tori"&gt;Discussion&lt;/a&gt; | &lt;a href="https://www.producthunt.com/r/p/1270608?app_id=339"&gt;Link&lt;/a&gt;&lt;/p&gt;</content></entry></feed>`;
  const [entry] = parseAtomEntries(xml);
  assert.equal(entry.title, "Tori");
  assert.equal(entry.link, "https://www.producthunt.com/products/tori");
  assert.equal(entry.summary, "Japanese listening practice");
  assert.equal(entry.outbound, "https://www.producthunt.com/r/p/1270608?app_id=339");
});

test("BetaList rows are read one startup block at a time", () => {
  const html = `<div class="x startup-row"> <a class="absolute inset-0" href="/startups/smartbi"></a> <a href="/startups/smartbi"><div>SmartBI</div></a> <div class="text-gray-600">AI copilot that turns marketing data into next steps</div></div>
    <div class="y startup-row"> <a href="/startups/citeprism"></a> <div>CitePrism</div> <div>Track how AI assistants mention your brand</div></div>`;
  const rows = parseBetaListHome(html);
  assert.deepEqual(rows.map((r) => r.slug), ["smartbi", "citeprism"]);
  assert.equal(rows[0].name, "SmartBI");
  assert.match(rows[1].tagline, /Track how AI/);
});

test("accelerator batches: start dates and the recent-batch window", () => {
  assert.equal(batchStartDate("Fall 2026"), "2026-09-01T00:00:00.000Z");
  assert.equal(batchStartDate("nonsense"), null);
  assert.deepEqual(recentBatches(new Date("2026-10-11T00:00:00Z")), ["Fall 2026", "Summer 2026", "Spring 2026"]);
  assert.deepEqual(recentBatches(new Date("2026-02-01T00:00:00Z"), 2), ["Winter 2026", "Fall 2025"]);
});

test("YC company pages list founders in embedded page data, CEO first", () => {
  const page = { props: { company: { founders: [{ full_name: "Aryaman S", title: "Founder/CTO", linkedin_url: "https://linkedin.com/in/ary" }, { full_name: "Maria G", title: "Founder/CEO", linkedin_url: "https://www.linkedin.com/in/maria/", twitter_url: "https://x.com/maria" }, { full_name: "", title: "x" }] } } };
  const html = `<div id="app" data-page="${JSON.stringify(page).replace(/"/g, "&quot;")}"></div>`;
  const founders = parseYcFounders(html);
  assert.deepEqual(founders.map((f) => f.name), ["Maria G", "Aryaman S"]);
  assert.equal(founders[0].linkedinUrl, "https://www.linkedin.com/in/maria/");
  assert.deepEqual(parseYcFounders("<html></html>"), []);
  assert.deepEqual(parseYcFounders('<div data-page="not json"></div>'), []);
});

test("Product Hunt makers are read from the embedded page data", () => {
  const html = '...,"makers":[{"__typename":"User","id":"1","name":"Lehi Thomas","username":"lehi_t"},{"id":"2","name":"x"}],"detailedReviews":[]';
  assert.deepEqual(parsePhMakers(html), ["Lehi Thomas"]);
  assert.deepEqual(parsePhMakers("<html></html>"), []);
});
