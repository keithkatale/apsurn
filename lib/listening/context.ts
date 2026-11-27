import { AuthenticationError, getCurrentUserId } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { businessProfileSchema, type BusinessProfile } from '@/lib/types'

export type ListeningContext = {
  userId: string
  companyId: string | null
  profile: BusinessProfile | null
  supabase: ReturnType<typeof createAdminClient>
}

/** Signed-in user, their workspace and business profile. Throws AuthenticationError when signed out. */
export async function getListeningContext(): Promise<ListeningContext> {
  const userId = await getCurrentUserId()
  const supabase = createAdminClient()
  const { data: company } = await supabase.from('companies').select('id').eq('user_id', userId).maybeSingle()
  let profile: BusinessProfile | null = null
  if (company?.id) {
    const { data: blueprint } = await supabase
      .from('company_blueprints')
      .select('profile')
      .eq('company_id', company.id)
      .maybeSingle()
    const parsed = businessProfileSchema.safeParse(blueprint?.profile)
    if (parsed.success) profile = parsed.data
  }
  return { userId, companyId: company?.id ?? null, profile, supabase }
}

/** True when Supabase says a table is missing (the 0005 migration has not been run on this project). */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || /could not find the table|does not exist/i.test(error.message ?? '')
}

export const MIGRATION_MESSAGE =
  'Listening is not set up on the database yet. Run supabase/migrations/0005_listening.sql in the Supabase SQL editor, then try again.'

export function authErrorResponse(error: unknown): Response | null {
  return error instanceof AuthenticationError ? Response.json({ error: 'Sign in to continue.' }, { status: 401 }) : null
}

/** Default watches from the business profile: buying-intent phrases plus one per competitor. */
export function defaultWatches(profile: BusinessProfile) {
  const keywords = [...new Set(profile.keywords.map((k) => k.trim()).filter(Boolean))].slice(0, 8)
  const competitors = [...new Set(profile.competitors.map((c) => c.trim()).filter(Boolean))].slice(0, 4)
  return [
    ...keywords.map((query) => ({ kind: 'keyword', query })),
    ...competitors.map((query) => ({ kind: 'competitor', query })),
  ]
}
