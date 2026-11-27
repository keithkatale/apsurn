import { notFound } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { isGuestUser } from '@/lib/auth/guest'
import { createClient } from '@/lib/supabase/server'

const DEFAULT_ADMINS = ['keith@apsurn.com', 'keithkatale1@gmail.com', 'justinissa088@gmail.com']

/** The only accounts allowed into /admin. Override with a comma-separated ADMIN_EMAILS env var. */
export function adminEmails(): string[] {
  const fromEnv = process.env.ADMIN_EMAILS?.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return fromEnv?.length ? fromEnv : DEFAULT_ADMINS
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email) && adminEmails().includes(email!.trim().toLowerCase())
}

/**
 * Password signup auto-confirms any address, so an email match alone proves nothing. Admin access also needs a
 * Google identity whose address is verified by Google and equals the account email.
 */
function hasVerifiedGoogleIdentity(user: User): boolean {
  const email = user.email?.toLowerCase()
  return (user.identities ?? []).some((identity) => {
    if (identity.provider !== 'google') return false
    const data = (identity.identity_data ?? {}) as { email?: string; email_verified?: boolean }
    return data.email_verified === true && data.email?.toLowerCase() === email
  })
}

/**
 * The signed-in admin, or null. All of these must hold: a real session (verified with Supabase, not just a cookie),
 * not a guest account, a confirmed email address, and an address on the allow list.
 */
export async function getAdminUser(): Promise<User | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    const user = data.user
    if (error || !user) return null
    if (isGuestUser(user)) return null
    if (!user.email_confirmed_at) return null
    if (!isAdminEmail(user.email)) return null
    if (!hasVerifiedGoogleIdentity(user)) return null
    return user
  } catch {
    return null
  }
}

/** Use at the top of every admin page and data function. Everyone else gets an ordinary 404. */
export async function requireAdmin(): Promise<User> {
  const user = await getAdminUser()
  if (!user) notFound()
  return user
}
