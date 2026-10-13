export const THEME_STORAGE_KEY = "apsurn-theme";

export type ThemePreference = "light" | "dark" | "system";

export function isDashboardPath(pathname = typeof window === "undefined" ? "" : window.location.pathname) {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

/** Every apsurn page carries the Apsurn GTM brand theme, except pages the customer publishes (/p/...) and the embeddable player. */
export function isAppBrandPath(pathname = typeof window === "undefined" ? "" : window.location.pathname) {
  return !(pathname.startsWith("/p/") || pathname === "/demo/embed");
}

export function isSetupPath(pathname = typeof window === "undefined" ? "" : window.location.pathname) {
  return pathname === "/setup" || pathname.startsWith("/setup/");
}

export function isLandingPath(pathname = typeof window === "undefined" ? "" : window.location.pathname) {
  return pathname === "/" || pathname === "";
}

export function isAuthPath(pathname = typeof window === "undefined" ? "" : window.location.pathname) {
  return pathname === "/login" || pathname === "/signup";
}

export function readStoredTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    /* private mode */
  }
  // The brand is dark-first: anyone who hasn't chosen a theme gets dark.
  return "dark";
}

export function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolvedDark(preference: ThemePreference) {
  return preference === "dark" || (preference === "system" && systemPrefersDark());
}

export function applyTheme(preference: ThemePreference, pathname?: string) {
  const path = pathname ?? (typeof window === "undefined" ? "" : window.location.pathname);
  const dark =
    isSetupPath(path) ||
    (isLandingPath(path) || isAuthPath(path)
      ? preference !== "light"
      : isDashboardPath(path) && resolvedDark(preference));
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("app-brand", isAppBrandPath(path));
}

export function persistTheme(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* private mode */
  }
  applyTheme(preference);
}

export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var r=document.documentElement,p=location.pathname;if(p.indexOf("/p/")===0||p==="/demo/embed")return;r.classList.add("app-brand");if(p==="/setup"||p.indexOf("/setup/")===0){r.classList.add("dark");return;}if(p==="/"||p===""||p==="/login"||p==="/signup"){if(localStorage.getItem("${THEME_STORAGE_KEY}")!=="light")r.classList.add("dark");return;}if(p!=="/dashboard"&&p.indexOf("/dashboard/")!==0)return;var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||t===null||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)r.classList.add("dark");}catch(e){}})();`;
