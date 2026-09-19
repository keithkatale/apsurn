"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PageLoader } from "@/components/loaders/page-loader";
import { setDashboardContentPending, subscribeDashboardContent } from "@/lib/navigation-progress";

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    return subscribeDashboardContent(setPending);
  }, []);

  useEffect(() => {
    setPending(false);
    setDashboardContentPending(false);
  }, [pathname]);

  return (
    <main className="relative isolate min-w-0 flex-1 overflow-hidden">
      <div className="h-full overflow-y-auto px-8 py-8">{children}</div>
      {pending ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-50">
          <PageLoader fullScreen={false} className="min-h-0 bg-transparent" />
        </div>
      ) : null}
    </main>
  );
}
