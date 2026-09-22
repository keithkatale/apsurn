"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  applyTheme,
  persistTheme,
  readStoredTheme,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [theme, setThemeState] = useState<ThemePreference>("system");

  useEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    applyTheme(stored, pathname);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(readStoredTheme(), window.location.pathname);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [pathname]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      setThemeState(next);
      persistTheme(next);
    },
    [],
  );

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used within ThemeProvider");
  return value;
}
