import { Suspense } from "react";
import { SettingsView } from "@/components/dashboard/SettingsView";

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsView />
    </Suspense>
  );
}
