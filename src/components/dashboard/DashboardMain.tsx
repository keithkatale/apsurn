"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { setDashboardContentPending } from "@/lib/navigation-progress";
import { cn } from "@/lib/cn";

// Pages that fill the window and scroll inside their own panels. A page with an id in its address (a campaign, a list)
// counts too, so each panel keeps scrolling on its own.
const FULL_BLEED = ["/dashboard/prospects", "/dashboard/copilot"];

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullBleed =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/tasks") ||
    FULL_BLEED.some((base) => pathname === base || pathname.startsWith(`${base}/`));

  useEffect(() => {
    setDashboardContentPending(false);
  }, [pathname]);

  return (
    <main className="relative isolate min-w-0 flex-1 overflow-hidden">
      <div
        className={cn(
          "h-full min-h-0",
          fullBleed ? "flex flex-col overflow-hidden" : "overflow-y-auto px-4 py-5 md:px-8 md:py-8",
        )}
      >
        {children}
      </div>
    </main>
  );
}
