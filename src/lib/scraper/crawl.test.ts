import test from "node:test";
import assert from "node:assert/strict";
import { assertSafePublicUrl } from "./crawl.ts";

test("rejects loopback and private IPv4 destinations", async () => {
  await assert.rejects(() => assertSafePublicUrl("http://127.0.0.1"));
  await assert.rejects(() => assertSafePublicUrl("http://10.0.0.2"));
  await assert.rejects(() => assertSafePublicUrl("http://169.254.169.254/latest/meta-data"));
});

test("rejects credentials and custom ports", async () => {
  await assert.rejects(() => assertSafePublicUrl("https://user:pass@example.com"));
  await assert.rejects(() => assertSafePublicUrl("https://example.com:8080"));
});
