/** The id after `base` in a pathname, e.g. idFromPath("/dashboard/campaigns/abc", "/dashboard/campaigns") is "abc". */
export function idFromPath(pathname: string, base: string): string | null {
  if (!pathname.startsWith(`${base}/`)) return null;
  const rest = pathname.slice(base.length + 1).split("/")[0];
  return rest ? decodeURIComponent(rest) : null;
}

/** Change the address bar without reloading or re-rendering the page; Next keeps usePathname in sync with it. */
export function pushPath(path: string) {
  if (typeof window === "undefined" || window.location.pathname === path) return;
  window.history.pushState(null, "", path);
}
