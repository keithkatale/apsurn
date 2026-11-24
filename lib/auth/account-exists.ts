type ListedUser = { id?: string; email?: string | null };

async function listUsersByEmail(email: string): Promise<ListedUser[]> {
  const normalized = email.trim().toLowerCase();
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !serviceKey) {
    throw new Error("Supabase admin credentials are not configured");
  }

  const response = await fetch(`${base}/auth/v1/admin/users?filter=${encodeURIComponent(normalized)}`, {
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Could not look up that account");
  }

  const payload = (await response.json()) as { users?: ListedUser[] } | ListedUser[];
  return Array.isArray(payload) ? payload : (payload.users ?? []);
}

export async function findAuthUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  const users = await listUsersByEmail(normalized);
  const match = users.find((user) => (user.email ?? "").toLowerCase() === normalized && user.id);
  if (!match?.id) return null;
  return { id: match.id, email: normalized };
}

/**
 * True when an auth user already exists for this email.
 * GoTrue's admin `filter` matches email, so this is not limited to the first page of users.
 */
export async function accountExists(email: string): Promise<boolean> {
  return Boolean(await findAuthUserByEmail(email));
}
