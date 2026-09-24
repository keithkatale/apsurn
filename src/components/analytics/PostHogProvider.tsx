"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { getPosthogKey, initPosthog, posthog } from "@/lib/posthog/client";

function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const firstLoad = useRef(true);

  useEffect(() => {
    if (!getPosthogKey() || !pathname) return;
    // First view is captured by the official snippet in layout.
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    const search = searchParams.toString();
    posthog.capture("$pageview", {
      $current_url: search ? `${window.location.origin}${pathname}${search ? `?${search}` : ""}` : `${window.location.origin}${pathname}`,
    });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPosthog();
  }, []);

  if (!getPosthogKey()) return children;

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      {children}
    </PHProvider>
  );
}
