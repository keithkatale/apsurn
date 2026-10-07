import test from "node:test";
import assert from "node:assert/strict";
import { contactPhotoUrl, countryFromLocation, extractMetaDescription } from "./profile.ts";

test("countryFromLocation reads the country from city, state and country strings", () => {
  assert.equal(countryFromLocation("San Francisco, CA, USA"), "United States");
  assert.equal(countryFromLocation("Austin, TX"), "United States");
  assert.equal(countryFromLocation("London, UK"), "United Kingdom");
  assert.equal(countryFromLocation("Berlin, Germany"), "Germany");
  assert.equal(countryFromLocation("Toronto, ON, Canada"), "Canada");
  assert.equal(countryFromLocation("Lagos, nigeria"), "Nigeria");
});

test("countryFromLocation returns null when there is no country to read", () => {
  assert.equal(countryFromLocation("Remote"), null);
  assert.equal(countryFromLocation("Paris"), null);
  assert.equal(countryFromLocation(""), null);
  assert.equal(countryFromLocation(null), null);
});

test("contactPhotoUrl prefers an explicit https photo, else the LinkedIn picture", () => {
  assert.equal(contactPhotoUrl({ photoUrl: "https://cdn.example.com/a.jpg" }), "https://cdn.example.com/a.jpg");
  assert.equal(contactPhotoUrl({ photoUrl: "http://insecure/a.jpg", linkedinUrl: "https://www.linkedin.com/in/jorge-lluch/" }), "https://unavatar.io/linkedin/jorge-lluch?fallback=false");
  assert.equal(contactPhotoUrl({}), null);
});

test("extractMetaDescription reads og:description before the meta description", () => {
  const html = `<html><head><meta name="description" content="Plain description of the product for teams."><meta property="og:description" content="Open Graph description that is long enough."></head></html>`;
  assert.equal(extractMetaDescription(html), "Open Graph description that is long enough.");
  assert.equal(extractMetaDescription("<html><head><meta name=\"description\" content=\"short\"></head></html>"), null);
});
