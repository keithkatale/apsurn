import { createAdminClient } from "@/lib/supabase/admin";
import { isGuestUser } from "@/lib/auth/guest";
import { firstNameOf, nameFromEmail, nameFromMetadata } from "@/lib/outreach/sender-name";
import type { EventRow } from "./analytics-core";

const PAGE = 1000;
/** Upper bound on events read per page load; the admin pages say so when it is hit. */
export const MAX_EVENTS = 60_000;

const EVENT_COLUMNS = "created_at, visitor_id, session_id, user_id, event, path, referrer_host, utm_source, utm_medium, device, country";

/** PostgREST returns at most 1000 rows per request, so read in pages. */
export async function loadEvents(sinceIso: string, filter?: { userIds?: string[]; visitorIds?: string[] }) {
  const db = createAdminClient();
  const rows: EventRow[] = [];
  let truncated = false;
  for (let from = 0; from < MAX_EVENTS; from += PAGE) {
    let query = db.from("app_events").select(EVENT_COLUMNS).gte("created_at", sinceIso).order("created_at", { ascending: true }).range(from, from + PAGE - 1);
    if (filter?.userIds?.length && filter.visitorIds?.length) {
      query = query.or(`user_id.in.(${filter.userIds.join(",")}),visitor_id.in.(${filter.visitorIds.join(",")})`);
    } else if (filter?.userIds?.length) {
      query = query.in("user_id", filter.userIds);
    }
    const { data, error } = await query;
    if (error) return { rows, truncated, error: error.message };
    rows.push(...((data ?? []) as EventRow[]));
    if (!data || data.length < PAGE) return { rows, truncated, error: null as string | null };
  }
  truncated = true;
  return { rows, truncated, error: null as string | null };
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  guest: boolean;
}

/** Everyone with an account (guests are workspaces without an email, so they are counted apart). */
export async function loadUsers(): Promise<{ users: AdminUser[]; guests: number }> {
  const db = createAdminClient();
  const users: AdminUser[] = [];
  let guests = 0;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    for (const user of data.users) {
      if (isGuestUser(user)) {
        guests += 1;
        continue;
      }
      users.push({
        id: user.id,
        email: user.email ?? "",
        name: nameFromMetadata(user.user_metadata) ?? nameFromEmail(user.email),
        createdAt: user.created_at,
        lastSignInAt: user.last_sign_in_at ?? null,
        guest: false,
      });
    }
    if (data.users.length < 1000) break;
  }
  users.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { users, guests };
}

export function firstNameForEmail(user: Pick<AdminUser, "name" | "email">): string {
  return firstNameOf(user.name) ?? "there";
}

/** Visitor ids that ever appeared with this user, so their activity before they signed up is theirs too. */
export async function visitorIdsForUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const db = createAdminClient();
  const { data } = await db.from("app_events").select("visitor_id").in("user_id", userIds).limit(5000);
  return [...new Set((data ?? []).map((row) => String(row.visitor_id)))];
}
