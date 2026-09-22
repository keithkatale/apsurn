export const THEME_STORAGE_KEY = "apsurn-theme";

export type ThemePreference = "light" | "dark" | "system";

export function isDashboardPath(pathname = typeof window === "undefined" ? "" : window.location.pathname) {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

export function readStoredTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    /* private mode */
  }
  return "system";
}

export function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolvedDark(preference: ThemePreference) {
  return preference === "dark" || (preference === "system" && systemPrefersDark());
}

export function applyTheme(preference: ThemePreference, pathname?: string) {
  const dark = isDashboardPath(pathname) && resolvedDark(preference);
  document.documentElement.classList.toggle("dark", dark);
}

export function persistTheme(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    /* private mode */
  }
  applyTheme(preference);
}

export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var p=location.pathname;if(p!=="/dashboard"&&p.indexOf("/dashboard/")!==0)return;var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;
