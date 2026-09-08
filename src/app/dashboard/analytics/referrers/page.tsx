import { redirect } from "next/navigation";

export default function AnalyticsReferrersRedirect() {
  redirect("/dashboard/analytics#referrers");
}
