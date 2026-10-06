/** "11-50 employees" / "50+ people" / "up to 200" -> a headcount range. Returns {} when the text doesn't parse — an unfiltered search, not a failure. */
export function parseHeadcountRange(range: string | undefined): { min?: number; max?: number } {
  if (!range) return {};
  const bounded = range.match(/(\d+)\s*[-–to]+\s*(\d+)/i);
  if (bounded) {
    const [a, b] = [Number(bounded[1]), Number(bounded[2])];
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const plus = range.match(/(\d+)\s*\+/);
  if (plus) return { min: Number(plus[1]) };
  const upTo = range.match(/(?:up to|under|below|max(?:imum)?)\s*(\d+)/i);
  if (upTo) return { max: Number(upTo[1]) };
  return {};
}
