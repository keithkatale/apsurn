"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PageLoader } from "@/components/loaders/page-loader";
import { setDashboardContentPending, subscribeDashboardContent } from "@/lib/navigation-progress";
import { cn } from "@/lib/cn";

// Pages that fill the window and scroll inside their own panels. A page with an id in its address (a campaign, a list)
// counts too, so each panel keeps scrolling on its own.
const FULL_BLEED = [
  "/dashboard/campaigns",
  "/dashboard/prospects",
  "/dashboard/copilot",
  "/dashboard/library",
];

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const fullBleed = FULL_BLEED.some((base) => pathname === base || pathname.startsWith(`${base}/`));

  useEffect(() => {
    return subscribeDashboardContent(setPending);
  }, []);

  useEffect(() => {
    setPending(false);
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
      {pending ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-50">
          <PageLoader fullScreen={false} className="min-h-0 bg-transparent" />
        </div>
      ) : null}
    </main>
  );
}
