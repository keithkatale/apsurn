import { DashboardMain } from "@/components/dashboard/DashboardMain";
import { CopilotThreadsProvider } from "@/components/copilot/CopilotThreadsProvider";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-dashboard className="relative flex h-screen flex-col overflow-hidden bg-neutral-50 md:flex-row">
      <CopilotThreadsProvider>
        <DashboardSidebar />
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <DashboardMain>{children}</DashboardMain>
        </div>
      </CopilotThreadsProvider>
    </div>
  );
}
