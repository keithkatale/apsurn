import { createClient } from "@/lib/supabase/server";

export class AuthenticationError extends Error {}

export async function getCurrentUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new AuthenticationError("Authentication required");
  return user.id;
}
