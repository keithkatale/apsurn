import { DashboardMain } from "@/components/dashboard/DashboardMain";
import { CopilotThreadsProvider } from "@/components/copilot/CopilotThreadsProvider";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-dashboard className="relative flex h-dvh flex-col overflow-hidden bg-white text-neutral-900 dark:bg-[#0a0a0a] dark:text-neutral-100 md:h-screen md:flex-row">
      <CopilotThreadsProvider>
        <DashboardSidebar />
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col max-md:pb-[calc(4rem+env(safe-area-inset-bottom))]">
          <DashboardMain>{children}</DashboardMain>
        </div>
      </CopilotThreadsProvider>
    </div>
  );
}
