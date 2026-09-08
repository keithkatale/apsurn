import { redirect } from "next/navigation";

export default function AnalyticsPagesRedirect() {
  redirect("/dashboard/analytics#pages");
}
