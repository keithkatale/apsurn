import assert from "node:assert/strict";
import { test } from "node:test";
import { planEmail } from "./angles.ts";
import type { BusinessContext } from "./personas.ts";

const business: BusinessContext = {
  companyName: "Acme",
  website: null,
  productSummary: "Pipeline software",
  valueProp: "Book more qualified meetings without hiring SDRs",
  positioning: "The outbound engine for seed-stage founders",
  industries: ["SaaS"],
  companySizeRange: "11-50",
  geographies: [],
  budgetSignals: ["Recently raised a seed round"],
  personas: [
    { title: "VP Sales", seniority: "VP", painPoints: ["Reps waste time on list building", "Inconsistent follow-up"], goals: ["Hit pipeline targets"] },
    { title: "Founder", seniority: "Founder", painPoints: ["No time to prospect"], goals: ["First repeatable sales motion"] },
  ],
  competitors: ["Apollo", "Outreach"],
  brandIdentity: null,
  brandVision: null,
};

test("different recipients get different structures and angles", () => {
  const plans = Array.from({ length: 40 }, (_, i) => planEmail({ seed: `contact-${i}:1:0`, stepNumber: 1, business, hasSignal: false }));
  assert.ok(new Set(plans.map((p) => p.framework)).size >= 4, "frameworks should vary");
  assert.ok(new Set(plans.map((p) => p.angle)).size >= 4, "angles should vary");
  assert.ok(new Set(plans.map((p) => p.ask)).size >= 3, "asks should vary");
});

test("the same recipient and step is stable; a new variant changes it", () => {
  const a = planEmail({ seed: "c1:1:0", stepNumber: 1, business, hasSignal: false });
  const b = planEmail({ seed: "c1:1:0", stepNumber: 1, business, hasSignal: false });
  assert.deepEqual(a, b);
  const variants = new Set(Array.from({ length: 12 }, (_, v) => planEmail({ seed: `c1:1:${v}`, stepNumber: 1, business, hasSignal: false }).framework));
  assert.ok(variants.size > 1);
});

test("persona is matched by title", () => {
  const plan = planEmail({ seed: "x", stepNumber: 1, business, contactTitle: "VP of Sales, EMEA", hasSignal: false });
  assert.equal(plan.persona?.title, "VP Sales");
});

test("follow-ups rotate through new angles", () => {
  const angles = [2, 3, 4, 5].map((n) => planEmail({ seed: "c1", stepNumber: n, business, hasSignal: false }).angle);
  assert.equal(new Set(angles).size, 4);
});
