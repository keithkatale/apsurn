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
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolvedDark(preference: ThemePreference) {
  return preference === "dark" || (preference === "system" && systemPrefersDark());
}

export function applyTheme(preference: ThemePreference, pathname?: string) {
  const path = pathname ?? (typeof window === "undefined" ? "" : window.location.pathname);
  let dark: boolean;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") {
      dark = resolvedDark(stored as ThemePreference);
    } else {
      // Default when no preference is saved yet:
      // Landing & auth are light-first; app/dashboard/leads/campaigns are dark-first.
      dark = isLandingPath(path) || isAuthPath(path) ? false : true;
    }
  } catch {
    dark = resolvedDark(preference);
  }

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

export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var r=document.documentElement,p=location.pathname;if(p.indexOf("/p/")===0||p==="/demo/embed")return;r.classList.add("app-brand");var t=localStorage.getItem("${THEME_STORAGE_KEY}");var d=false;if(t==="dark"){d=true;}else if(t==="light"){d=false;}else if(t==="system"){d=matchMedia("(prefers-color-scheme: dark)").matches;}else{d=!(p==="/"||p===""||p==="/login"||p==="/signup");}if(d){r.classList.add("dark");}else{r.classList.remove("dark");}}catch(e){}})();`;
