/**
 * Maps ICP wording onto Icypeas' closed industry vocabulary.
 *
 * Same problem as the YC mapping in sources/vocabulary.ts, same fix: a
 * 488-value enum, matched exactly by the API, silently returning zero
 * results for anything not in it. "SaaS" and "Computer Software" are both
 * real ICP wording and both invalid — the closest real entries are "Software
 * Development" and "Technology, Information and Internet". Unlike YC's
 * taxonomy this one reads as ordinary English phrases, so token-overlap
 * matching against the real list works better here than a hand-built
 * synonym table would, and needs far less maintenance.
 */

import { ICYPEAS_INDUSTRIES } from "./data/icypeas-industries.ts";

type Industry = (typeof ICYPEAS_INDUSTRIES)[number];

/** A few multi-word ICP terms whose natural phrasing does not overlap the enum's wording at all. */
const ALIASES: Record<string, Industry[]> = {
  saas: ["Software Development", "Technology, Information and Internet"],
  "b2b saas": ["Software Development"],
  software: ["Software Development", "IT Services and IT Consulting"],
  fintech: ["Financial Services", "Capital Markets"],
  "financial technology": ["Financial Services", "Capital Markets"],
  ai: ["Technology, Information and Internet"],
  "artificial intelligence": ["Technology, Information and Internet"],
  martech: ["Marketing Services", "Advertising Services"],
  healthtech: ["Hospitals and Health Care", "Health, Wellness & Fitness"],
  devtools: ["Software Development", "IT Services and IT Consulting"],
  ecommerce: ["Retail"],
  "e-commerce": ["Retail"],
};

const STOP_WORDS = new Set(["technology", "tech", "solutions", "services", "and", "for", "the", "of", "in"]);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string): Set<string> {
  return new Set(normalize(value).split(" ").filter((word) => word && !STOP_WORDS.has(word)));
}

const INDUSTRY_TOKENS: Array<{ industry: Industry; tokens: Set<string> }> = ICYPEAS_INDUSTRIES.map((industry) => ({
  industry,
  tokens: tokens(industry),
}));

/**
 * Turns free-text ICP industry phrases into valid enum values.
 *
 * Every phrase is scored against every enum entry by token overlap (Jaccard),
 * and entries scoring above a floor are kept, ranked. Exact and alias matches
 * short-circuit first since they are certain; everything else is a fuzzy
 * fallback so a phrase like "field service management" still lands on
 * something plausible ("Software Development") rather than matching nothing.
 */
export function matchIcypeasIndustries(phrases: string[], maxPerPhrase = 3): Industry[] {
  const result: Industry[] = [];
  const seen = new Set<string>();
  const add = (industry: Industry) => {
    if (!seen.has(industry)) {
      seen.add(industry);
      result.push(industry);
    }
  };

  for (const phrase of phrases) {
    const cleaned = normalize(phrase);
    if (!cleaned) continue;

    // Exact match: the ICP already used a real enum value verbatim.
    const exact = ICYPEAS_INDUSTRIES.find((industry) => normalize(industry) === cleaned);
    if (exact) {
      add(exact);
      continue;
    }

    // Alias table: common ICP shorthand with no token overlap in the enum.
    // Checked over every word AND bigram, not just the whole phrase — "SaaS"
    // must fire inside "Sales Technology SaaS", and "financial technology"
    // must fire inside "Financial Technology Software" even though a
    // different word in the same phrase ("software") also has its own entry.
    // Every alias hit contributes; none of them short-circuits the others.
    let aliasHit = false;
    const words = cleaned.split(" ").filter(Boolean);
    const candidates = [cleaned, ...words];
    for (let i = 0; i + 1 < words.length; i++) candidates.push(`${words[i]} ${words[i + 1]}`);

    for (const candidate of new Set(candidates)) {
      const alias = ALIASES[candidate];
      if (alias) {
        alias.forEach(add);
        aliasHit = true;
      }
    }

    // Fuzzy fallback: rank every enum entry by token overlap and keep the
    // best few. Only when the alias table found nothing at all — Jaccard
    // over short phrases surfaces noise ("field service management" pulling
    // in "Investment Management" on the shared word "management" alone),
    // so a confident alias hit should not be diluted by a weak fuzzy one.
    if (aliasHit) continue;

    const needle = tokens(phrase);
    if (needle.size === 0) continue;

    const scored = INDUSTRY_TOKENS.map(({ industry, tokens: entryTokens }) => {
      let shared = 0;
      for (const token of needle) if (entryTokens.has(token)) shared += 1;
      const union = new Set([...needle, ...entryTokens]).size;
      return { industry, score: union > 0 ? shared / union : 0 };
    })
      .filter((entry) => entry.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPerPhrase);

    for (const entry of scored) add(entry.industry);
  }

  return result;
}

export function isValidIcypeasIndustry(value: string): value is Industry {
  return (ICYPEAS_INDUSTRIES as readonly string[]).includes(value);
}
