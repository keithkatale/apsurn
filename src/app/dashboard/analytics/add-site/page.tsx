import { redirect } from "next/navigation";

export default function AddAnalyticsSiteRedirect() {
  redirect("/dashboard/analytics#sites");
}
