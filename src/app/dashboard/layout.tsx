import { Suspense } from "react";
import { DashboardMain } from "@/components/dashboard/DashboardMain";
import { DashboardTopNav } from "@/components/dashboard/DashboardTopNav";
import { SettingsPanel } from "@/components/dashboard/SettingsPanel";
import { SettingsPanelProvider } from "@/components/dashboard/settings-panel-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-dashboard className="relative flex h-screen flex-col overflow-hidden bg-neutral-50">
      <SettingsPanelProvider>
        <DashboardTopNav />
        <div className="relative flex min-h-0 flex-1 flex-col">
          <DashboardMain>{children}</DashboardMain>
          <Suspense fallback={null}>
            <SettingsPanel />
          </Suspense>
        </div>
      </SettingsPanelProvider>
    </div>
  );
}
