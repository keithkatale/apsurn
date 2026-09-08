import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { RealtimeDashboard } from "@/components/analytics/RealtimeDashboard";

export default function AnalyticsRealtimePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      }
    >
      <RealtimeDashboard />
    </Suspense>
  );
}
