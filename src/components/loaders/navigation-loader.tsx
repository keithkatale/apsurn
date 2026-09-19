"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PageLoader } from "@/components/loaders/page-loader";
import { setNavigationPending, subscribeNavigation } from "@/lib/navigation-progress";

const SHOW_DELAY_MS = 240;

function isInternalNavigation(anchor: HTMLAnchorElement) {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  return url.pathname !== window.location.pathname || url.search !== window.location.search;
}

function isDashboardTabSwitch(nextPath: string) {
  return window.location.pathname.startsWith("/dashboard") && nextPath.startsWith("/dashboard");
}

export function NavigationLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return subscribeNavigation(setPending);
  }, []);

  useEffect(() => {
    setPending(false);
    setNavigationPending(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor || !isInternalNavigation(anchor)) return;
      const url = new URL(anchor.href, window.location.href);
      if (isDashboardTabSwitch(url.pathname)) {
        return;
      }
      setPending(true);
      setNavigationPending(true);
    }

    function onPopState() {
      if (window.location.pathname.startsWith("/dashboard")) return;
      setPending(true);
      setNavigationPending(true);
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  if (!visible || pathname.startsWith("/dashboard")) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white/80 backdrop-blur-[2px]">
      <PageLoader fullScreen={false} className="min-h-0 bg-transparent" />
    </div>
  );
}
