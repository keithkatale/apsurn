import test from "node:test";
import assert from "node:assert/strict";
import { pickKnownContact, type KnownContactRow } from "./index-lookup.ts";

function row(over: Partial<KnownContactRow>): KnownContactRow {
  return {
    personId: "p1",
    fullName: "Jane Doe",
    title: "Head of Sales",
    email: "jane@acme.com",
    emailStatus: "verified",
    lastVerifiedAt: null,
    confidence: 0.6,
    ...over,
  };
}

test("prefers a contact whose title matches the target personas", () => {
  const picked = pickKnownContact(
    [row({ personId: "a", title: "Engineer", confidence: 0.9 }), row({ personId: "b", title: "VP Sales", confidence: 0.4 })],
    ["sales"],
  );
  assert.equal(picked?.personId, "b");
});

test("returns null when targets are given but nobody known holds a matching role", () => {
  assert.equal(pickKnownContact([row({ title: "Engineer" })], ["sales"]), null);
});

test("with no target titles, takes the verified, most confident contact", () => {
  const picked = pickKnownContact(
    [row({ personId: "a", emailStatus: "accept_all", confidence: 0.9 }), row({ personId: "b", emailStatus: "verified", confidence: 0.5 })],
    [],
  );
  assert.equal(picked?.personId, "b");
});

test("returns null for an empty set", () => {
  assert.equal(pickKnownContact([], ["sales"]), null);
});
