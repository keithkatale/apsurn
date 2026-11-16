import type { ReactNode } from "react";

/** Radar tab: conversation feed plus the company rail. */
export function DashboardHomeShell({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className="grid h-full min-h-0 w-full xl:grid-cols-[minmax(0,1fr)_24rem] xl:gap-6">
      <div className="flex min-h-0 min-w-0 flex-col">{children}</div>
      <aside className="hidden min-w-0 space-y-4 overflow-y-auto px-4 py-4 xl:block xl:pr-6 xl:pl-0 xl:pt-6 xl:pb-3">{aside}</aside>
    </div>
  );
}
