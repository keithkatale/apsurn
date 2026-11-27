import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { isGuestUser } from '@/lib/auth/guest'
import { getReportBySlug } from '@/lib/reports'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { keepReportLeads } from './actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Keep your lead list', robots: { index: false, follow: false } }

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }

export default async function ClaimReport({ params, searchParams }: Props) {
  const { slug } = await params
  const { error } = await searchParams
  const here = `/r/${slug}/claim`

  const { data } = await (await createClient()).auth.getUser()
  const user = data.user
  if (!user || isGuestUser(user)) redirect(`/signup?next=${encodeURIComponent(here)}`)

  const report = await getReportBySlug(slug)
  if (!report) notFound()

  const admin = createAdminClient()
  const [{ data: company }, { data: claimed }] = await Promise.all([
    admin.from('companies').select('id').eq('user_id', user.id).maybeSingle(),
    admin.from('report_claims').select('id').eq('user_id', user.id).maybeSingle(),
  ])
  const blocked = Boolean(company || claimed)

  const card =
    'rounded-[12px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-6 text-left'
  const primary =
    'inline-flex h-10 items-center justify-center rounded-[10px] bg-[var(--mh-fg)] px-5 text-sm font-medium text-[var(--mh-bg)]'
  const secondary =
    'inline-flex h-10 items-center justify-center rounded-[10px] border border-[var(--mh-soft)] px-5 text-sm font-medium'

  return (
    <div className="marketing-home min-h-screen bg-[var(--mh-bg)] text-[var(--mh-fg)]">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-16 sm:px-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-wider text-[var(--mh-muted)]">{report.company.name}</p>
          <h1 className="mt-1 font-display text-3xl font-normal">Keep this lead list?</h1>
        </div>

        {error && (
          <p className="rounded-[10px] border border-red-300 bg-red-100 px-3 py-2 text-sm text-red-900">
            We could not copy the list just now. Nothing was changed. Try again, or start fresh.
          </p>
        )}

        {blocked ? (
          <div className={card}>
            <p className="text-sm">
              Your account already has a workspace, so this list can&apos;t be added to it. Your existing leads are untouched.
            </p>
            <div className="mt-4">
              <Link href="/leads" className={primary}>
                Go to my leads
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className={card}>
              <h2 className="text-base font-medium">Keep the list</h2>
              <p className="mt-1 text-sm text-[var(--mh-muted)]">
                Your account starts with the {report.leadTotal} target accounts and their contacts, the ICP, the blueprint, competitors
                and {report.sequences.length} email {report.sequences.length === 1 ? 'sequence' : 'sequences'} from this report. You can
                edit everything.
              </p>
              <form action={keepReportLeads} className="mt-4">
                <input type="hidden" name="slug" value={slug} />
                <button type="submit" className={primary}>
                  Keep these leads
                </button>
              </form>
            </div>
            <div className={card}>
              <h2 className="text-base font-medium">Start fresh</h2>
              <p className="mt-1 text-sm text-[var(--mh-muted)]">
                Skip this list and set up your own business. Paste your website and we build a list for you.
              </p>
              <div className="mt-4">
                <Link href="/setup" className={secondary}>
                  Start fresh
                </Link>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
