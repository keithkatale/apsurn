'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/access'
import { buildCampaigns, buildCompetitors, buildLeads, finishReport, revokeReport, startReportBuild } from '@/lib/reports-build'

// Server actions are public POST endpoints: each one re-checks the admin gate itself, and every build step only
// touches a report this admin created. Failures come back as values because thrown errors are masked in production.

export type StepName = 'competitors' | 'leads' | 'campaigns' | 'finish'
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong')

export async function startReport(url: string): Promise<Result<{ shareId: string; slug: string; name: string }>> {
  const admin = await requireAdmin()
  const clean = String(url ?? '').trim().slice(0, 500)
  if (clean.length < 3) return { ok: false, error: 'Enter a website address' }
  try {
    const started = await startReportBuild(admin.id, clean)
    revalidatePath('/admin/reports')
    return { ok: true, ...started }
  } catch (error) {
    return { ok: false, error: message(error) }
  }
}

export async function runReportStep(shareId: string, step: StepName): Promise<Result> {
  const admin = await requireAdmin()
  if (!/^[0-9a-f-]{36}$/i.test(shareId)) return { ok: false, error: 'Invalid report' }
  try {
    if (step === 'competitors') await buildCompetitors(shareId, admin.id)
    else if (step === 'leads') await buildLeads(shareId, admin.id)
    else if (step === 'campaigns') await buildCampaigns(shareId, admin.id)
    else if (step === 'finish') await finishReport(shareId, admin.id)
    else return { ok: false, error: 'Unknown step' }
    if (step === 'finish') revalidatePath('/admin/reports')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: message(error) }
  }
}

export async function revokeReportLink(formData: FormData) {
  const admin = await requireAdmin()
  const shareId = String(formData.get('shareId') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(shareId)) return
  await revokeReport(shareId, admin.id)
  revalidatePath('/admin/reports')
}
