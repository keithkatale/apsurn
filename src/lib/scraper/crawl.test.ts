import test from "node:test";
import assert from "node:assert/strict";
import { assertSafePublicUrl, sameSite } from "./crawl.ts";

test("rejects loopback and private IPv4 destinations", async () => {
  await assert.rejects(() => assertSafePublicUrl("http://127.0.0.1"));
  await assert.rejects(() => assertSafePublicUrl("http://10.0.0.2"));
  await assert.rejects(() => assertSafePublicUrl("http://169.254.169.254/latest/meta-data"));
});

test("rejects credentials and custom ports", async () => {
  await assert.rejects(() => assertSafePublicUrl("https://user:pass@example.com"));
  await assert.rejects(() => assertSafePublicUrl("https://example.com:8080"));
});

test("treats the apex and www hosts of one site as the same site, but not other domains", () => {
  assert.equal(sameSite("latecheckout.agency", "www.latecheckout.agency"), true);
  assert.equal(sameSite("www.example.com", "example.com"), true);
  assert.equal(sameSite("example.com", "evil.com"), false);
  assert.equal(sameSite("example.com", "blog.example.com"), false);
  assert.equal(sameSite("example.com", "example.com.evil.com"), false);
});
