'use server'

import { redirect } from 'next/navigation'
import { isGuestUser } from '@/lib/auth/guest'
import { logEvent } from '@/lib/events'
import { claimReport } from '@/lib/reports'
import { createClient } from '@/lib/supabase/server'

export async function keepReportLeads(formData: FormData) {
  const slug = String(formData.get('slug') ?? '')
  const claimPath = `/r/${slug}/claim`
  const { data } = await (await createClient()).auth.getUser()
  const user = data.user
  // Server actions are public POST endpoints, so the account check is repeated here.
  if (!user || isGuestUser(user)) redirect(`/signup?next=${encodeURIComponent(claimPath)}`)

  const result = await claimReport(slug, user.id)
  if (result.ok) {
    void logEvent('report_claimed', { userId: user.id, props: { slug } })
    redirect('/leads')
  }
  if (result.reason === 'has_workspace' || result.reason === 'already_claimed') redirect('/leads')
  if (result.reason === 'not_found') redirect('/')
  redirect(`${claimPath}?error=1`)
}
