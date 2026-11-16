import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/auth/session";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function requireCompany(): Promise<{ userId: string; db: SupabaseClient; companyId: string | null }> {
  const userId = await getCurrentUserId();
  const db = createAdminClient();
  const { data: company } = await db.from("companies").select("id").eq("user_id", userId).maybeSingle();
  return { userId, db, companyId: (company?.id as string | undefined) ?? null };
}
