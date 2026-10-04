import { redirect } from "next/navigation";

// Copilot merged into the Home tab — keep this route alive as a redirect
// for old links/bookmarks rather than leaving duplicate functionality.
export default function CopilotRedirectPage() {
  redirect("/dashboard");
}
