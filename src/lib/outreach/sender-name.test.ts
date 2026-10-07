import test from "node:test";
import assert from "node:assert/strict";
import { fillSenderPlaceholders, firstNameOf, nameFromEmail, nameFromMetadata } from "./sender-name.ts";

test("nameFromMetadata reads full name or given and family names", () => {
  assert.equal(nameFromMetadata({ full_name: "Keith Katale" }), "Keith Katale");
  assert.equal(nameFromMetadata({ given_name: "Keith", family_name: "Katale" }), "Keith Katale");
  assert.equal(nameFromMetadata({ guest: true }), null);
});

test("nameFromEmail only trusts addresses that spell out a first and last name", () => {
  assert.equal(nameFromEmail("rajiv.ramanan@spendflo.com"), "Rajiv Ramanan");
  assert.equal(nameFromEmail("keithkatale1@gmail.com"), null);
  assert.equal(nameFromEmail("g-3b656b37-a60b-436e-8738-511b8180189f@guest.apsurn.com"), null);
  assert.equal(firstNameOf("Keith Katale"), "Keith");
});

test("placeholders in the sign-off are filled with the real name, or removed when it is unknown", () => {
  const body = "Hi {{first_name}},\n\nOne line.\n\nBest,\n[Sender Name]";
  assert.equal(fillSenderPlaceholders(body, "Keith"), "Hi {{first_name}},\n\nOne line.\n\nBest,\nKeith");
  assert.equal(fillSenderPlaceholders(body, null), "Hi {{first_name}},\n\nOne line.\n\nBest,");
  assert.equal(fillSenderPlaceholders("Hi,\n\n[Company Name]\n\nBest,\n[Your Name]", "Keith"), "Hi,\n\nBest,\nKeith");
});
