import type { ExtractedPerson } from "./types";

export type Pattern = "first.last" | "first" | "flast" | "firstlast" | "f.last" | "last";

function names(fullName: string) {
  const parts = fullName.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z\s-]/g, "").split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? { first: parts[0], last: parts.at(-1)! } : null;
}

function localFor(pattern: Pattern, first: string, last: string) {
  if (pattern === "first.last") return `${first}.${last}`;
  if (pattern === "first") return first;
  if (pattern === "flast") return `${first[0]}${last}`;
  if (pattern === "f.last") return `${first[0]}.${last}`;
  if (pattern === "last") return last;
  return `${first}${last}`;
}

const COMMON_PATTERNS: Pattern[] = ["first.last", "first", "flast", "firstlast", "f.last", "last"];

export function learnEmailPattern(people: ExtractedPerson[], domain: string): Pattern | null {
  const counts = new Map<Pattern, number>();
  for (const person of people) {
    const name = names(person.fullName);
    if (!name || !person.email?.endsWith(`@${domain}`)) continue;
    const local = person.email.split("@")[0];
    for (const pattern of COMMON_PATTERNS) {
      if (localFor(pattern, name.first, name.last) === local) counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
    }
  }
  const winner = [...counts].sort((a, b) => b[1] - a[1])[0];
  return winner && winner[1] >= 2 ? winner[0] : null;
}

export function inferEmail(fullName: string, domain: string, pattern: Pattern | null) {
  const name = names(fullName);
  return name && pattern ? `${localFor(pattern, name.first, name.last)}@${domain}` : null;
}

export function emailCandidates(fullName: string, domain: string, learnedPattern: Pattern | null) {
  const name = names(fullName);
  if (!name) return [];
  const patterns = learnedPattern
    ? [learnedPattern, ...COMMON_PATTERNS.filter((pattern) => pattern !== learnedPattern)]
    : COMMON_PATTERNS;
  return [...new Set(patterns.map((pattern) => `${localFor(pattern, name.first, name.last)}@${domain}`))];
}
