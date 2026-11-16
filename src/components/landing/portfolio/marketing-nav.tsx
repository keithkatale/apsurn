"use client";

import Image from "next/image";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { label: "How it works", href: "#how-it-works", id: "how-it-works" },
  { label: "Compare", href: "#compare", id: "compare" },
  { label: "Pricing", href: "#pricing", id: "pricing" },
] as const;

function useIsMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSignedIn(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);
  return signedIn;
}

function useActiveSection(): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const ids = NAV_ITEMS.map((item) => item.id);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (elements.length === 0) return;

    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        let best: string | null = null;
        let bestRatio = 0;
        for (const id of ids) {
          const ratio = ratios.get(id) ?? 0;
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = id;
          }
        }
        setActive(bestRatio > 0.12 ? best : null);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.12, 0.25, 0.5, 0.75] },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return active;
}

function NavThemeToggle(): ReactNode {
  const mounted = useIsMounted();
  const { theme, setTheme } = useTheme();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const sync = () => setIsDark(document.documentElement.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [theme]);

  const toggleTheme = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const next = isDark ? "light" : "dark";
    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const supportsViewTransitions =
      typeof document !== "undefined" && typeof document.startViewTransition === "function";

    if (!supportsViewTransitions || prefersReducedMotion) {
      setTheme(next);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy));
    const root = document.documentElement;
    root.style.setProperty("--theme-cx", `${cx}px`);
    root.style.setProperty("--theme-cy", `${cy}px`);
    root.style.setProperty("--theme-r", `${radius}px`);
    root.dataset.themeAnim = "1";

    const transition = document.startViewTransition(() => {
      setTheme(next);
    });
    transition.finished.finally(() => {
      delete root.dataset.themeAnim;
    });
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={mounted ? (isDark ? "Switch to light theme" : "Switch to dark theme") : "Toggle theme"}
      aria-pressed={mounted ? isDark : undefined}
      className="mh-focus relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[var(--mh-bg)] ring-1 ring-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] transition-colors"
    >
      <span aria-hidden="true" className="relative h-4 w-4">
        <Sun
          className={`absolute inset-0 h-4 w-4 text-[var(--mh-fg)] transition-all duration-300 ${
            mounted && isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
          }`}
        />
        <Moon
          className={`absolute inset-0 h-4 w-4 text-[var(--mh-fg)] transition-all duration-300 ${
            mounted && !isDark ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0"
          }`}
        />
      </span>
    </button>
  );
}

export function MarketingPillNav(): ReactNode {
  const signedIn = useSignedIn();
  const activeId = useActiveSection();
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [pillRect, setPillRect] = useState<{ x: number; width: number } | null>(null);
  const [hasMeasured, setHasMeasured] = useState(false);
  const accountHref = signedIn ? "/dashboard" : "/signup?next=/setup";

  const activeIndex = NAV_ITEMS.findIndex((item) => item.id === activeId);

  useLayoutEffect(() => {
    const list = listRef.current;
    const activeEl = activeIndex >= 0 ? itemRefs.current[activeIndex] : null;
    if (!list || !activeEl) {
      setPillRect(null);
      return;
    }
    const listRect = list.getBoundingClientRect();
    const itemRect = activeEl.getBoundingClientRect();
    setPillRect({
      x: itemRect.left - listRect.left,
      width: itemRect.width,
    });
  }, [activeIndex]);

  useEffect(() => {
    if (!pillRect) return;
    const id = requestAnimationFrame(() => setHasMeasured(true));
    return () => cancelAnimationFrame(id);
  }, [pillRect]);

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-auto fixed left-1/2 top-6 z-50 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1.5 rounded-full border border-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] bg-[var(--mh-bg)] p-1.5 shadow-sm sm:top-8"
    >
        <Link
          href="/"
          className="mh-focus mr-0.5 hidden items-center gap-2 rounded-full pl-1.5 pr-2 sm:inline-flex"
        >
          <Image src="/branding/apsurn-gtm.png" alt="" width={22} height={22} priority className="size-[22px] rounded-[5px]" />
          <span className="text-[13px] font-medium tracking-tight text-[var(--mh-fg)]">apsurn</span>
        </Link>

        <ul ref={listRef} className="relative flex items-center gap-0.5 sm:gap-1">
          {pillRect ? (
            <motion.span
              aria-hidden="true"
              initial={false}
              animate={{ x: pillRect.x, width: pillRect.width }}
              transition={hasMeasured ? { type: "spring", stiffness: 380, damping: 32 } : { duration: 0 }}
              style={{ left: 0, top: 0, bottom: 0 }}
              className="absolute rounded-full bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] ring-1 ring-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)]"
            />
          ) : null}
          {NAV_ITEMS.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <li
                key={item.href}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                className="relative"
              >
                <a
                  href={item.href}
                  aria-current={isActive ? "true" : undefined}
                  className="mh-focus relative inline-flex cursor-pointer items-center justify-center rounded-full px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-300 sm:px-3.5 sm:text-sm"
                >
                  <span
                    className={
                      isActive
                        ? "relative z-10 text-[var(--mh-fg)]"
                        : "relative z-10 text-[color:color-mix(in_srgb,var(--mh-fg)_55%,transparent)] hover:text-[var(--mh-fg)]"
                    }
                  >
                    {item.label}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>

        <div className="ml-0.5 flex items-center gap-1 border-l border-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] pl-1.5">
          {signedIn ? null : (
            <Link
              href="/login"
              className="mh-focus hidden rounded-full px-2.5 py-1.5 text-[13px] font-medium text-[color:color-mix(in_srgb,var(--mh-fg)_55%,transparent)] transition-colors hover:text-[var(--mh-fg)] sm:inline-flex"
            >
              Sign in
            </Link>
          )}
          <Link
            href={accountHref}
            className="mh-focus inline-flex h-8 items-center justify-center rounded-full bg-[var(--mh-fg)] px-3 text-[13px] font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90"
          >
            {signedIn ? "Dashboard" : "Get started"}
          </Link>
          <NavThemeToggle />
        </div>
    </nav>
  );
}
