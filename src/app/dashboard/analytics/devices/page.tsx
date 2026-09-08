import { redirect } from "next/navigation";

export default function AnalyticsDevicesRedirect() {
  redirect("/dashboard/analytics#devices");
}
