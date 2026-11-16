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
  parseOverpassElements,
  parseRedditLaunches,
  parseRemoteOk,
  parseWwrRss,
  parseYcFounders,
  recentBatches,
  founderLinkedIn,
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

test("job boards name the company and keep the job URL, without a person", () => {
  const remote = parseRemoteOk([
    { legal: "Legal notice" },
    { company: "Acme", position: "Engineer", location: "Worldwide", url: "https://remoteok.com/remote-jobs/1", apply_url: "https://acme.com/jobs" },
    { company: "Acme", position: "Designer", url: "https://remoteok.com/remote-jobs/2", apply_url: "https://acme.com/other" },
    { company: "Board", position: "Role", url: "https://remoteok.com/x", apply_url: "https://remoteok.com/apply" },
  ]);
  assert.equal(remote.length, 2);
  assert.equal(remote[0].domain, "acme.com");
  assert.equal(remote[0].sourceUrl, "https://remoteok.com/remote-jobs/1");
  assert.equal(remote[1].domain, null);

  const rss = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[Northwind: Support lead]]></title><link>https://weworkremotely.com/remote-jobs/northwind</link><region>North America</region><description><![CDATA[Apply at https://northwind.example/jobs]]></description></item></channel></rss>`;
  const wwr = parseWwrRss(rss);
  assert.equal(wwr[0].name, "Northwind");
  assert.equal(wwr[0].description, "Support lead");
  assert.equal(wwr[0].domain, "northwind.example");
  assert.equal(wwr[0].sourceUrl, "https://weworkremotely.com/remote-jobs/northwind");
});

test("reddit launches use the outbound company site, not the poster", () => {
  const posts = parseRedditLaunches({
    data: {
      children: [
        { data: { title: "We launched Acme, a billing tool", url: "https://acme.com", permalink: "/r/startups/comments/1/we_launched" } },
        { data: { title: "How do I price a SaaS?", url: "https://www.reddit.com/r/startups/comments/2", permalink: "/r/startups/comments/2" } },
        { data: { title: "Just shipped a side project", url: "https://github.com/someone/app", permalink: "/r/SaaS/comments/3" } },
      ],
    },
  });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].domain, "acme.com");
  assert.equal(posts[0].sourceUrl, "https://www.reddit.com/r/startups/comments/1/we_launched");
});

test("OpenStreetMap places keep name, website, phone and address only", () => {
  const places = parseOverpassElements([
    { tags: { name: "Elm Dental", website: "https://elmdental.com", phone: "+1 512 555 0100", "addr:housenumber": "10", "addr:street": "Main St", "addr:city": "Austin" } },
    { tags: { name: "No Site Cafe", phone: "555" } },
  ]);
  assert.equal(places.length, 2);
  assert.equal(places[0].domain, "elmdental.com");
  assert.equal(places[0].phone, "+1 512 555 0100");
  assert.equal(places[0].location, "10 Main St Austin");
  assert.equal(places[1].domain, null);
  assert.equal(founderLinkedIn("https://linkedin.com/company/acme"), null);
  assert.equal(founderLinkedIn("not a url"), null);
});

test("Product Hunt makers are read from the embedded page data", () => {
  const html = '...,"makers":[{"__typename":"User","id":"1","name":"Lehi Thomas","username":"lehi_t"},{"id":"2","name":"x"}],"detailedReviews":[]';
  assert.deepEqual(parsePhMakers(html), ["Lehi Thomas"]);
  assert.deepEqual(parsePhMakers("<html></html>"), []);
});
