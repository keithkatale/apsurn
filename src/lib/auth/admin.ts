import { createClient } from "@/lib/supabase/server";
import { AuthenticationError } from "./session";

export class AdminAccessError extends Error {}

const ADMIN_EMAILS = new Set(["keith@apsurn.com", "issa@apsurn.com"]);

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email && ADMIN_EMAILS.has(email.toLowerCase()));
}

/** Throws AuthenticationError if not signed in, AdminAccessError if signed in but not an admin. */
export async function requireAdminUser(): Promise<{ id: string; email: string }> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new AuthenticationError("Authentication required");
  if (!isAdminEmail(user.email)) throw new AdminAccessError("Not authorized");
  return { id: user.id, email: user.email! };
}
