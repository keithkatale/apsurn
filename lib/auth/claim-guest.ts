import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { GUEST_ID_COOKIE, isGuestUser } from "@/lib/auth/guest";

const OWNED_TABLES = [
  "companies",
  "sequences",
  "prospect_lists",
  "prospecting_runs",
  "prospecting_schedules",
  "outreach_drafts",
  "market_keywords",
  "copilot_conversations",
  "connected_inboxes",
] as const;

/** Move a guest workspace onto a real account that does not already have a company. */
export async function claimGuestWorkspace() {
  const cookieStore = await cookies();
  const guestId = cookieStore.get(GUEST_ID_COOKIE)?.value;
  if (!guestId) return { claimed: false as const };

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user || isGuestUser(user) || user.id === guestId) return { claimed: false as const };

  const admin = createAdminClient();
  const { data: guest } = await admin.auth.admin.getUserById(guestId);
  if (!guest.user || !isGuestUser(guest.user)) {
    cookieStore.delete(GUEST_ID_COOKIE);
    return { claimed: false as const };
  }

  const { data: existingCompany } = await admin.from("companies").select("id").eq("user_id", user.id).maybeSingle();
  if (existingCompany?.id) {
    cookieStore.delete(GUEST_ID_COOKIE);
    return { claimed: false as const, reason: "account_has_workspace" as const };
  }

  const { data: guestCompany } = await admin.from("companies").select("id").eq("user_id", guestId).maybeSingle();
  if (!guestCompany?.id) {
    cookieStore.delete(GUEST_ID_COOKIE);
    return { claimed: false as const };
  }

  for (const table of OWNED_TABLES) {
    const { error } = await admin.from(table).update({ user_id: user.id }).eq("user_id", guestId);
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      console.error("[auth/claim]", table, error.message);
      return { claimed: false as const, reason: "transfer_failed" as const };
    }
  }

  await admin.auth.admin.deleteUser(guestId);
  cookieStore.delete(GUEST_ID_COOKIE);
  return { claimed: true as const };
}
