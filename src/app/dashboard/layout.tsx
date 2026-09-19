import { Sidebar } from "@/components/dashboard/Sidebar";
import { DashboardMain } from "@/components/dashboard/DashboardMain";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50">
      <Sidebar />
      <DashboardMain>{children}</DashboardMain>
    </div>
  );
}
