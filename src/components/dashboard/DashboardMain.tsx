"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PageLoader } from "@/components/loaders/page-loader";
import { setDashboardContentPending, subscribeDashboardContent } from "@/lib/navigation-progress";
import { cn } from "@/lib/cn";

const FULL_BLEED = new Set([
  "/dashboard/campaigns",
  "/dashboard/prospects",
  "/dashboard/copilot",
  "/dashboard/market-insights",
  "/dashboard/library",
]);

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const fullBleed = FULL_BLEED.has(pathname);

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
