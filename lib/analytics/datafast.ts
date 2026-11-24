type DatafastFn = (goal: string, params?: Record<string, string>) => void;

declare global {
  interface Window {
    datafast?: DatafastFn & { q?: unknown[] };
  }
}

/** DataFast custom goal. Names stay lowercase; values are clipped to the API limits. */
export function trackGoal(name: string, params?: Record<string, string | number | boolean | null | undefined>) {
  if (typeof window === "undefined" || typeof window.datafast !== "function") return;
  const goal = name.toLowerCase().replace(/[^a-z0-9_:-]/g, "_").slice(0, 64);
  if (!goal) return;
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value == null || value === "") continue;
    const safeKey = key.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 64);
    if (!safeKey) continue;
    clean[safeKey] = String(value).slice(0, 255);
    if (Object.keys(clean).length >= 10) break;
  }
  window.datafast(goal, Object.keys(clean).length ? clean : undefined);
}
