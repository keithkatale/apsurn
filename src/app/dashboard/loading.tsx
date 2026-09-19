import { PageLoader } from "@/components/loaders/page-loader";

export default function DashboardLoading() {
  return <PageLoader fullScreen={false} className="min-h-[50vh] bg-transparent" />;
}
