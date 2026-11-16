import { Suspense } from "react";
import { BusinessView } from "@/components/dashboard/BusinessView";

export const metadata = {
  title: "Business — apsurn",
  description: "View and edit your company blueprint, ICP, and buyer personas.",
};

export default function BusinessPage() {
  return (
    <Suspense fallback={null}>
      <BusinessView />
    </Suspense>
  );
}
