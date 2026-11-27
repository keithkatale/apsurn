import Link from 'next/link'
import { SetupNotice } from '@/components/admin/SetupNotice'
import { Panel, Pill, Table, Td, ago } from '@/components/admin/ui'
import { requireAdmin } from '@/lib/admin/access'
import { safe } from '@/lib/admin/safe'
import { getRecentEvents } from '@/lib/admin/stats'
import { EVENT_NAMES } from '@/lib/events'

const FILTERS = EVENT_NAMES.filter((n) => n !== 'pageview')

const tone = (name: string) =>
  name === 'payment_succeeded' ? 'good' : name === 'signup' || name === 'email_sent' ? 'good' : name === 'checkout_started' ? 'warn' : 'neutral'

export default async function AdminActivity({ searchParams }: { searchParams: Promise<{ name?: string }> }) {
  await requireAdmin()
  const name = (await searchParams).name ?? ''
  const active = (FILTERS as readonly string[]).includes(name) ? name : ''
  const events = await safe(() => getRecentEvents(active, 150))

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-normal">Activity</h1>
        <p className="text-sm text-[var(--mh-muted)]">The latest 150 things users did. Pageviews are on the Traffic tab.</p>
      </div>

      {!events && <SetupNotice />}

      <div className="flex flex-wrap gap-2 text-xs">
        {['', ...FILTERS].map((f) => (
          <Link
            key={f || 'all'}
            href={f ? `/admin/activity?name=${f}` : '/admin/activity'}
            className={`rounded-full border border-[var(--mh-soft)] px-3 py-1 ${active === f ? 'bg-[var(--mh-fg)] text-[var(--mh-bg)]' : 'text-[var(--mh-fg)]'}`}
          >
            {f || 'All'}
          </Link>
        ))}
      </div>

      <Panel>
        <Table head={['When', 'Event', 'User', 'Details']} empty={events && events.length === 0 ? 'No activity recorded yet.' : undefined}>
          {(events ?? []).map((e) => (
            <tr key={e.id}>
              <Td>{ago(e.created_at)}</Td>
              <Td>
                <Pill tone={tone(e.name)}>{e.name}</Pill>
              </Td>
              <Td>{e.email ?? <span className="text-[var(--mh-muted)]">guest / unknown</span>}</Td>
              <Td className="max-w-[28rem] truncate text-[var(--mh-muted)]">
                {[e.path, ...Object.entries(e.props).map(([k, v]) => `${k}: ${String(v)}`)].filter(Boolean).join(' · ')}
              </Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  )
}
