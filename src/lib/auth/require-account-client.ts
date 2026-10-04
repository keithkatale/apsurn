export function accountPageUrl() {
  const next = `${window.location.pathname}${window.location.search}`;
  return `/signup?next=${encodeURIComponent(next)}`;
}

/** Leave for account creation, then return to the current page. */
export function goToAccount() {
  window.location.assign(accountPageUrl());
}

/** Send a guest to account creation before checkout. Returns true when navigation started. */
export async function redirectGuestToAccount(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/session");
    const data = (await response.json().catch(() => null)) as { user?: boolean; guest?: boolean } | null;
    if (data?.user && !data.guest) return false;
  } catch {
    // Treat an unknown session as signed out so checkout cannot open.
  }
  goToAccount();
  return true;
}
