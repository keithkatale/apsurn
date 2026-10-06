import test from "node:test";
import assert from "node:assert/strict";
import { companyKey, pickDomainForName } from "./domain-core.ts";

const r = (url: string, title?: string) => ({ url, title });

test("accepts the company's own site when the host carries its name", () => {
  assert.equal(pickDomainForName("Acme HQ Inc.", [r("https://www.linkedin.com/company/acme-hq"), r("https://acmehq.io/about")]), "acmehq.io");
  assert.equal(pickDomainForName("Linear", [r("https://linear.app/")]), "linear.app");
});

test("never accepts aggregators, and returns null rather than guessing", () => {
  assert.equal(pickDomainForName("Acme", [r("https://www.crunchbase.com/organization/acme"), r("https://glassdoor.com/acme")]), null);
  assert.equal(pickDomainForName("Zephyr Dynamics", [r("https://totallyunrelated.com/", "Weather news")]), null);
});

test("rejects a host that merely shares a short prefix with the name", () => {
  assert.equal(pickDomainForName("Mercury Labs", [r("https://mer.co/")]), null);
});

test("legal suffixes and punctuation don't affect the match key", () => {
  assert.equal(companyKey("Acme, Inc."), companyKey("ACME"));
  assert.equal(pickDomainForName("Acme, Inc.", [r("https://acme.com")]), "acme.com");
});

test("a descriptive title can confirm a host that abbreviates the name", () => {
  assert.equal(pickDomainForName("Brightwave Robotics", [r("https://brightwave.ai/", "Brightwave Robotics | Home")]), "brightwave.ai");
});

test("a long unrelated host that merely contains the name is rejected", () => {
  assert.equal(pickDomainForName("Glow", [r("https://theglowcocalmcarry.com/")]), null);
  assert.equal(pickDomainForName("Orbit", [r("https://myorbitalexpressdelivery.com/")]), null);
});

test("returns the registrable domain, not a subdomain", () => {
  assert.equal(pickDomainForName("Armadin", [r("https://trust.armadin.com/blog")]), "armadin.com");
  assert.equal(pickDomainForName("Acme", [r("https://app.acme.co.uk/")]), "acme.co.uk");
});

test("small prefixes and suffixes around the name are still the company", () => {
  assert.equal(pickDomainForName("Acme", [r("https://getacme.com/")]), "getacme.com");
  assert.equal(pickDomainForName("Acme Robotics", [r("https://acme.io/")]), "acme.io");
});
