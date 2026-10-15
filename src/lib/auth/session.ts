import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export class AuthenticationError extends Error {}

export async function getCurrentUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new AuthenticationError("Authentication required");
  return user.id;
}

/**
 * For server-rendered pages. A stale or revoked session used to throw here and show Next's "This page couldn't
 * load" error; the person should land on the sign-in page instead, and come back to where they were.
 */
export async function getCurrentUserIdOrRedirect(next: string): Promise<string> {
  try {
    return await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) redirect(`/login?next=${encodeURIComponent(next)}`);
    throw error;
  }
}
