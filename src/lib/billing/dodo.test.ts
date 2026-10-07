import test from "node:test";
import assert from "node:assert/strict";
import { dodoBearerToken } from "./dodo.ts";

test("live checkout uses the live key, not the test key", () => {
  assert.equal(
    dodoBearerToken({ environment: "live_mode", apiKey: "test-key", liveApiKey: "live-key" }),
    "live-key",
  );
});

test("test checkout uses the test key", () => {
  assert.equal(
    dodoBearerToken({ environment: "test_mode", apiKey: "test-key", liveApiKey: "live-key" }),
    "test-key",
  );
});

test("live checkout fails closed when the live key is missing", () => {
  assert.throws(
    () => dodoBearerToken({ environment: "live_mode", apiKey: "test-key", liveApiKey: "" }),
    /DODO_PAYMENTS_LIVE_API_KEY/,
  );
});
