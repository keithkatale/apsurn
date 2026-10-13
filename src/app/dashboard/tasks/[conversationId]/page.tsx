import { DashboardHomePage } from "../../home-view";

// Home reads the task id from the address bar, so this is the same page opened on a task.
export default function TaskPage() {
  return DashboardHomePage();
}

export const dynamic = "force-dynamic";
