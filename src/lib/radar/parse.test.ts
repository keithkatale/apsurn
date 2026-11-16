import assert from "node:assert/strict";
import { test } from "node:test";
import {
  gdeltDate,
  hiringCompanyName,
  parseAtsJobs,
  parseBluesky,
  parseDiscourse,
  parseGdelt,
  parseHnHiring,
  parseHnIntent,
  parseLemmy,
  parseSecFormD,
  parseStackExchange,
} from "./parse.ts";

test("HN intent hits become item-link signals", () => {
  const out = parseHnIntent({ hits: [{ objectID: "42", title: "Ask HN: alternative to Zapier?", author: "bob", created_at: "2026-01-01T00:00:00Z", story_text: "<p>Need one</p>" }, { objectID: "", title: "x" }] });
  assert.equal(out.length, 1);
  assert.equal(out[0].url, "https://news.ycombinator.com/item?id=42");
  assert.equal(out[0].excerpt, "Need one");
});

test("HN hiring extracts the company and skips replies", () => {
  assert.equal(hiringCompanyName("Acme (YC S24) | Engineer | Remote"), "Acme");
  assert.equal(hiringCompanyName("Thanks, applied!"), null);
  const out = parseHnHiring({ hits: [{ objectID: "1", comment_text: "<p>Acme | SDR | NYC</p>", author: "x", created_at: "2026-01-02T00:00:00Z" }, { objectID: "2", comment_text: "nice thread" }] });
  assert.equal(out.length, 1);
  assert.equal(out[0].entityName, "Acme");
  assert.equal(out[0].type, "hiring");
});

test("SEC Form D drops funds and builds a filing url", () => {
  const out = parseSecFormD({
    hits: { hits: [
      { _source: { display_names: ["Rocket Labs Inc. (CIK 0001234567)"], ciks: ["0001234567"], adsh: "0001234567-26-000001", file_date: "2026-01-05" } },
      { _source: { display_names: ["Big Growth Fund II LP (CIK 0009999999)"], ciks: ["0009999999"], adsh: "0009999999-26-000002", file_date: "2026-01-05" } },
    ] },
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].entityName, "Rocket Labs Inc.");
  assert.equal(out[0].url, "https://www.sec.gov/Archives/edgar/data/1234567/000123456726000001/");
  assert.equal(out[0].type, "funding");
});

test("GDELT dates and funding classification", () => {
  assert.equal(gdeltDate("20260115T123000Z"), "2026-01-15T12:30:00Z");
  assert.equal(gdeltDate("nope"), null);
  const out = parseGdelt({ articles: [{ url: "https://x.com/a", title: "Startup raises $10M Series A", seendate: "20260115T123000Z", domain: "x.com" }, { url: "https://x.com/b", title: "Mayor opens bridge", seendate: "20260115T123000Z" }] });
  assert.deepEqual(out.map((s) => s.type), ["funding", "news"]);
});

test("Bluesky posts map to profile post urls", () => {
  const out = parseBluesky({ posts: [{ uri: "at://did:plc:1/app.bsky.feed.post/abc", author: { handle: "a.bsky.social", displayName: "A" }, record: { text: "any tool for invoicing?", createdAt: "2026-01-01T00:00:00Z" } }] });
  assert.equal(out[0].url, "https://bsky.app/profile/a.bsky.social/post/abc");
  assert.equal(out[0].author, "A");
});

test("Discourse, Stack Exchange and Lemmy parsers", () => {
  const d = parseDiscourse({ topics: [{ id: 7, slug: "need-a-crm", title: "Need a CRM" }], posts: [{ topic_id: 7, post_number: 1, blurb: "<b>help</b>", username: "u", created_at: "2026-01-01T00:00:00Z" }] }, "forum.example.com");
  assert.equal(d[0].url, "https://forum.example.com/t/need-a-crm/7/1");
  assert.equal(d[0].excerpt, "help");
  const s = parseStackExchange({ items: [{ link: "https://softwarerecs.stackexchange.com/q/1", title: "Best &amp; cheap CRM", creation_date: 1767225600, owner: { display_name: "z" } }] }, "softwarerecs");
  assert.equal(s[0].title, "Best & cheap CRM");
  assert.equal(s[0].eventAt, "2026-01-01T00:00:00.000Z");
  const l = parseLemmy({ posts: [{ post: { ap_id: "https://lemmy.world/post/1", name: "Alternative to X?", body: "b", published: "2026-01-01T00:00:00Z" }, creator: { name: "c" } }] }, "lemmy.world");
  assert.equal(l[0].meta?.forum, "lemmy:lemmy.world");
});

test("ATS jobs parse across all three boards and filter by role terms", () => {
  const gh = parseAtsJobs("greenhouse", "acme", { jobs: [{ title: "Account Executive", absolute_url: "https://boards.greenhouse.io/acme/jobs/1", updated_at: "2026-01-01T00:00:00Z" }, { title: "Janitor", absolute_url: "https://boards.greenhouse.io/acme/jobs/2" }] }, ["account executive"]);
  assert.equal(gh.length, 1);
  const lv = parseAtsJobs("lever", "acme", [{ text: "SDR", hostedUrl: "https://jobs.lever.co/acme/1", createdAt: 1767225600000 }], []);
  assert.equal(lv[0].eventAt, "2026-01-01T00:00:00.000Z");
  const ab = parseAtsJobs("ashby", "acme", { jobs: [{ title: "Growth", jobUrl: "https://jobs.ashbyhq.com/acme/1", publishedAt: "2026-01-01" }] }, []);
  assert.equal(ab[0].entityName, "acme");
});
