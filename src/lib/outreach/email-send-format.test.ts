import test from "node:test";
import assert from "node:assert/strict";
import { htmlToPlain, plainToEmailHtml } from "./email-html.ts";
import { tokenizeLeadMentions } from "./merge-fields.ts";

test("sent HTML keeps the blank line between paragraphs and the sign-off lines", () => {
  const html = plainToEmailHtml("Hi Rajiv,\n\nFirst thought.\n\nBest,\nLCA");
  assert.equal(html, "<div>Hi Rajiv,</div><div><br></div><div>First thought.</div><div><br></div><div>Best,<br>LCA</div>");
  // The plain-text alternative reads the same as the editor text.
  assert.equal(htmlToPlain(html), "Hi Rajiv,\n\nFirst thought.\n\nBest,\nLCA");
});

test("HTML bodies from the editor are sent untouched", () => {
  const html = "<div>Hi</div><div><br></div><div>There</div>";
  assert.equal(plainToEmailHtml(html), html);
});

test("tokenizing a lead's title does not cut it out of a longer word", () => {
  const lead = { fullName: "Rajiv Ramanan", title: "Co-Founder", companyName: "Spendflo" };
  assert.equal(tokenizeLeadMentions("Co-Founders often share a goal. As Co-Founder, you know.", lead), "Co-Founders often share a goal. As {{title}}, you know.");
});
