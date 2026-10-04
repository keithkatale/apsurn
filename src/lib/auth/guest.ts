import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError } from "@/lib/auth/session";

export const GUEST_EMAIL_SUFFIX = "@guest.apsurn.com";
export const GUEST_ID_COOKIE = "apsurn_guest_id";

type GuestLike = {
  email?: string | null;
  is_anonymous?: boolean;
  user_metadata?: Record<string, unknown> | null;
};

export function isGuestUser(user: GuestLike | null | undefined) {
  if (!user) return false;
  if (user.is_anonymous) return true;
  if (user.user_metadata?.guest === true) return true;
  return (user.email ?? "").toLowerCase().endsWith(GUEST_EMAIL_SUFFIX);
}

export class AccountRequiredError extends Error {
  code = "account_required" as const;
  constructor() {
    super("Create an account before sending campaigns.");
  }
}

export async function assertRegisteredUser(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) throw new AuthenticationError("Authentication required");
  if (isGuestUser(data.user)) throw new AccountRequiredError();
  return data.user;
}

export function accountRequiredResponse() {
  return {
    error: "Create an account before sending campaigns.",
    code: "account_required" as const,
  };
}
