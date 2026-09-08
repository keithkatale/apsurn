import { redirect } from "next/navigation";

export default function AnalyticsLocationsRedirect() {
  redirect("/dashboard/analytics#locations");
}
