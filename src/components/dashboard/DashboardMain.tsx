"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PageLoader } from "@/components/loaders/page-loader";
import { setDashboardContentPending, subscribeDashboardContent } from "@/lib/navigation-progress";
import { cn } from "@/lib/cn";

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const lockScroll = pathname === "/dashboard/campaigns" || pathname === "/dashboard/prospects";
  const flush = pathname === "/dashboard/campaigns";

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
          "h-full",
          lockScroll ? "flex flex-col overflow-hidden" : "overflow-y-auto px-8 py-8",
          lockScroll && !flush && "px-4 py-3",
          flush && "p-0",
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
