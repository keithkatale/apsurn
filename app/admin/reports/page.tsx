import { CopyLink } from '@/components/admin/CopyLink'
import { ReportBuilder } from '@/components/admin/ReportBuilder'
import { Panel, Pill, Table, Td, ago } from '@/components/admin/ui'
import { requireAdmin } from '@/lib/admin/access'
import { safe } from '@/lib/admin/safe'
import { reportUrl } from '@/lib/reports'
import { createAdminClient } from '@/lib/supabase/admin'
import { revokeReportLink } from './actions'

// The build steps run as server actions on this route; the slowest one (leads) needs the long limit.
export const maxDuration = 120
export const dynamic = 'force-dynamic'

type ReportRow = {
  id: string
  slug: string
  status: string
  revoked: boolean
  name: string
  sourceUrl: string
  createdAt: string
  visitors: number
  visits: number
  signups: number
  claims: number
}

async function loadReports(adminId: string): Promise<ReportRow[]> {
  const admin = createAdminClient()
  const { data: shares, error } = await admin
    .from('report_shares')
    .select('id, slug, status, revoked_at, source_url, created_at, company_id')
    .eq('created_by', adminId)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  if (!shares?.length) return []

  const slugs = shares.map((s) => s.slug as string)
  const [companies, visits, authEvents, claims] = await Promise.all([
    admin.from('companies').select('id, name').in('id', shares.map((s) => s.company_id)),
    admin.from('apsurn_events').select('path, anon_id, user_id').eq('name', 'pageview').in('path', slugs.map((s) => `/r/${s}`)).limit(20000),
    admin.from('apsurn_events').select('name, props, user_id').in('name', ['signup', 'login']).not('props->>report', 'is', null).limit(5000),
    admin.from('report_claims').select('slug').in('slug', slugs),
  ])

  const names = new Map((companies.data ?? []).map((c) => [c.id as string, (c.name as string | null) ?? '']))
  const tally = new Map<string, { people: Set<string>; views: number; signups: Set<string>; claims: number }>()
  const entry = (slug: string) => {
    let e = tally.get(slug)
    if (!e) tally.set(slug, (e = { people: new Set(), views: 0, signups: new Set(), claims: 0 }))
    return e
  }
  for (const v of visits.data ?? []) {
    if (v.user_id === adminId) continue // your own previews do not count
    const e = entry(String(v.path).slice(3))
    e.views += 1
    if (v.anon_id) e.people.add(String(v.anon_id))
  }
  for (const ev of authEvents.data ?? []) {
    const slug = (ev.props as { report?: string } | null)?.report
    if (slug && ev.name === 'signup' && ev.user_id) entry(slug).signups.add(String(ev.user_id))
  }
  for (const c of claims.data ?? []) entry(String(c.slug)).claims += 1

  return shares.map((s) => {
    const t = tally.get(s.slug as string)
    return {
      id: s.id as string,
      slug: s.slug as string,
      status: s.status as string,
      revoked: Boolean(s.revoked_at),
      name: names.get(s.company_id as string) || (s.source_url as string) || 'Untitled',
      sourceUrl: (s.source_url as string | null) ?? '',
      createdAt: s.created_at as string,
      visitors: t?.people.size ?? 0,
      visits: t?.views ?? 0,
      signups: t?.signups.size ?? 0,
      claims: t?.claims ?? 0,
    }
  })
}

const button =
  'rounded-[8px] border border-[var(--mh-soft)] px-2 py-1 text-[11px] font-medium hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)]'

export default async function AdminReports() {
  const user = await requireAdmin()
  const reports = await safe(() => loadReports(user.id))

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-normal">Shareable reports</h1>
        <p className="text-sm text-[var(--mh-muted)]">
          Add a business website and Apsurn runs the full setup for it: ICP, blueprint, competitors, target accounts and email
          sequences. You get a link to send them. Anyone who signs up from it can keep the whole list. Only reports you created appear here.
        </p>
      </div>

      <Panel title="New report">
        <ReportBuilder />
      </Panel>

      {reports === null && (
        <Panel>
          <p className="text-sm text-[var(--mh-muted)]">
            Could not load reports. Run <code>supabase/migrations/0007_report_shares.sql</code> in the Supabase SQL editor, then reload.
          </p>
        </Panel>
      )}

      {reports && (
        <Panel title="Your reports" note="Visits exclude you and bots. Signups count accounts created from the report page.">
          <Table
            head={['Business', 'Visitors', 'Visits', 'Signups', 'Kept list', 'Created', 'Link']}
            empty={reports.length === 0 ? 'No reports yet. Add a website above.' : undefined}
          >
            {reports.map((r) => {
              const url = reportUrl(r.slug)
              const live = r.status === 'ready' && !r.revoked
              return (
                <tr key={r.id}>
                  <Td>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-[11px] text-[var(--mh-muted)]">{r.sourceUrl.replace(/^https?:\/\//, '')}</div>
                  </Td>
                  <Td className="font-mono">{r.visitors}</Td>
                  <Td className="font-mono">{r.visits}</Td>
                  <Td className="font-mono">{r.signups}</Td>
                  <Td className="font-mono">{r.claims}</Td>
                  <Td>{ago(r.createdAt)}</Td>
                  <Td>
                    {r.revoked ? (
                      <Pill tone="bad">Revoked</Pill>
                    ) : live ? (
                      <div className="flex items-center gap-2">
                        <a href={url} target="_blank" rel="noreferrer" className="font-mono text-[11px] underline">
                          /r/{r.slug}
                        </a>
                        <CopyLink url={url} />
                        <form action={revokeReportLink}>
                          <input type="hidden" name="shareId" value={r.id} />
                          <button type="submit" className={button}>
                            Revoke
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Pill tone="warn">Not finished</Pill>
                        <ReportBuilder resumeId={r.id} />
                      </div>
                    )}
                  </Td>
                </tr>
              )
            })}
          </Table>
        </Panel>
      )}
    </>
  )
}
