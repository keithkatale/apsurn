import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AuthenticationError, getCurrentUserId } from "@/lib/auth/session";

export async function requireAnalyticsUser() {
  try {
    return await getCurrentUserId();
  } catch (error) {
    if (error instanceof AuthenticationError) return null;
    throw error;
  }
}

export async function ownedSiteIds(userId: string, siteId?: string | null) {
  const db = createAdminClient();
  let query = db.from("analytics_sites").select("site_id").eq("user_id", userId);
  if (siteId) query = query.eq("site_id", siteId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.site_id as string);
}

export function unauthorized() {
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}

export async function siteFilterOrError(userId: string, siteId: string | null) {
  const ids = await ownedSiteIds(userId, siteId);
  if (siteId && ids.length === 0) {
    return { error: NextResponse.json({ error: "Site not found" }, { status: 404 }) };
  }
  return { siteIds: ids };
}
