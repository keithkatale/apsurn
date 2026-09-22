import { redirect } from "next/navigation";

export default function SequencesRedirectPage() {
  redirect("/dashboard/campaigns");
}
