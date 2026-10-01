import { redirect } from "next/navigation";

export default function InboxesRedirectPage() {
  redirect("/dashboard/settings");
}
