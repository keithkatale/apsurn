import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluate } from "./expr.ts";

test("arithmetic with precedence, parentheses and variables", () => {
  assert.equal(evaluate("2 + 3 * 4", {}), 14);
  assert.equal(evaluate("(2 + 3) * 4", {}), 20);
  assert.equal(evaluate("seats * price * 12", { seats: 10, price: 30 }), 3600);
  assert.equal(evaluate("-a + 5", { a: 2 }), 3);
});

test("functions", () => {
  assert.equal(evaluate("min(3, 9) + max(1, 2)", {}), 5);
  assert.equal(evaluate("round(2.6)", {}), 3);
});

test("bad input yields NaN rather than throwing or executing", () => {
  assert.ok(Number.isNaN(evaluate("1 / 0", {})));
  assert.ok(Number.isNaN(evaluate("unknown + 1", {})));
  assert.ok(Number.isNaN(evaluate("process.exit(1)", {})));
  assert.ok(Number.isNaN(evaluate("alert(1); 2", {})));
  assert.ok(Number.isNaN(evaluate("1 +", {})));
  assert.ok(Number.isNaN(evaluate("constructor", {})));
});
