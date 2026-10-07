import test from "node:test";
import assert from "node:assert/strict";
import { DraftStreamParser, formatEmailBody, parseDraftText } from "./email-format.ts";

test("formatEmailBody splits one block into greeting, short paragraphs and keeps a sign-off", () => {
  const out = formatEmailBody("Hi Jorge, I saw Abacum is hiring two SDRs. That usually means pipeline is the bottleneck. We help teams in that spot. Worth a quick look? Best, Sam");
  const paragraphs = out.split("\n\n");
  assert.equal(paragraphs[0], "Hi Jorge,");
  assert.ok(paragraphs.length >= 4);
  assert.equal(paragraphs[paragraphs.length - 1], "Best,\nSam");
});

test("formatEmailBody keeps existing paragraphs and collapses extra blank lines", () => {
  const out = formatEmailBody("Hi Ana,\n\n\n\nFirst thought.\n\nSecond thought.\n\nBest,\nSam");
  assert.equal(out, "Hi Ana,\n\nFirst thought.\n\nSecond thought.\n\nBest,\nSam");
});

test("formatEmailBody turns one-line-per-thought text into paragraphs", () => {
  assert.equal(formatEmailBody("Hi Ana,\nFirst thought.\nSecond thought.\nBest,\nSam"), "Hi Ana,\n\nFirst thought.\n\nSecond thought.\n\nBest,\nSam");
});

test("parseDraftText reads the SUBJECT shape and legacy JSON", () => {
  assert.deepEqual(parseDraftText("SUBJECT: hiring two SDRs\n---\nHi Ana,\n\nOne line.\n\nBest,\nSam"), {
    subject: "hiring two SDRs",
    body: "Hi Ana,\n\nOne line.\n\nBest,\nSam",
  });
  assert.deepEqual(parseDraftText('{"subject":"s","body":"Hi Ana,\\n\\nHello there.\\n\\nBest,\\nSam"}'), { subject: "s", body: "Hi Ana,\n\nHello there.\n\nBest,\nSam" });
  assert.equal(parseDraftText("no subject here"), null);
});

test("DraftStreamParser streams the subject first, then the body, across arbitrary chunks", () => {
  const parser = new DraftStreamParser();
  let subject = "";
  let body = "";
  const text = "SUBJECT: hiring two SDRs\n---\nHi Ana,\n\nSaw the posts.\n\nBest,\nSam";
  for (let i = 0; i < text.length; i += 3) {
    const piece = parser.feed(text.slice(i, i + 3));
    subject += piece.subject ?? "";
    body += piece.body ?? "";
  }
  assert.equal(subject, "hiring two SDRs");
  assert.equal(body, "Hi Ana,\n\nSaw the posts.\n\nBest,\nSam");
});
