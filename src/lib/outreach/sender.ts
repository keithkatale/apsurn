import { createAdminClient } from "@/lib/supabase/admin";
import { firstNameOf, nameFromEmail, nameFromMetadata } from "./sender-name";

export interface SenderProfile {
  fullName: string | null;
  firstName: string | null;
  email: string | null;
}

/** The signed-in person's real name and email, from their account, for sign-offs. */
export async function loadSenderProfile(userId: string): Promise<SenderProfile> {
  try {
    const { data } = await createAdminClient().auth.admin.getUserById(userId);
    const user = data?.user;
    const email = user?.email ?? null;
    const fullName = nameFromMetadata(user?.user_metadata) ?? nameFromEmail(email);
    return { fullName, firstName: firstNameOf(fullName), email };
  } catch {
    return { fullName: null, firstName: null, email: null };
  }
}
