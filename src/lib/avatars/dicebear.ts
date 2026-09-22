const STYLES = ["open-peeps", "micah"] as const;

function styleForSeed(seed: string): (typeof STYLES)[number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return STYLES[hash % STYLES.length];
}

export function dicebearFaceUrl(seed: string): string {
  const value = seed.trim() || "profile";
  const params = new URLSearchParams({
    seed: value,
    size: "128",
    backgroundColor: "transparent",
  });
  return `https://api.dicebear.com/9.x/${styleForSeed(value)}/png?${params.toString()}`;
}
