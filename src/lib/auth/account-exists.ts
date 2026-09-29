type ListedUser = { email?: string | null };

/**
 * True when an auth user already exists for this email.
 * GoTrue's admin `filter` matches email, so this is not limited to the first page of users.
 */
export async function accountExists(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return false;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !serviceKey) {
    throw new Error("Supabase admin credentials are not configured");
  }

  const response = await fetch(
    `${base}/auth/v1/admin/users?filter=${encodeURIComponent(normalized)}`,
    {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error("Could not look up that account");
  }

  const payload = (await response.json()) as { users?: ListedUser[] } | ListedUser[];
  const users = Array.isArray(payload) ? payload : (payload.users ?? []);
  return users.some((user) => (user.email ?? "").toLowerCase() === normalized);
}
