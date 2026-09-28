"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Renders children only while `html` does not have the dark class. */
export function LightThemeOnly({ children }: { children: ReactNode }) {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setLight(!root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  if (!light) return null;
  return children;
}
