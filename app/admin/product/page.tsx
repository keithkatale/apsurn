import { BarChart, RankBars } from '@/components/admin/Charts'
import { Panel, StatTile, Table, Td } from '@/components/admin/ui'
import { requireAdmin } from '@/lib/admin/access'
import { safe } from '@/lib/admin/safe'
import { getCreditUsage, getDailySeries, getProductCounts, getSignalSources, parseRange } from '@/lib/admin/stats'

export default async function AdminProduct({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireAdmin()
  const days = parseRange((await searchParams).range)
  const [counts, series, sources, usage] = await Promise.all([
    safe(getProductCounts),
    safe(() => getDailySeries(days)),
    safe(() => getSignalSources(days)),
    safe(() => getCreditUsage(days)),
  ])
  const short = (d: string) => d.slice(5)
  const spent = (usage ?? []).filter((u) => u.credits < 0)

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-normal">Product usage</h1>
        <p className="text-sm text-[var(--mh-muted)]">How people use Apsurn: leads, campaigns, email and listening.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Workspaces" value={counts?.workspaces ?? null} />
        <StatTile label="Leads" value={counts?.leads ?? null} />
        <StatTile label="Campaigns" value={counts?.campaigns ?? null} />
        <StatTile label="Emails sent" value={counts?.emailsSent ?? null} />
        <StatTile label="Connected inboxes" value={counts?.inboxes ?? null} />
        <StatTile label="Signals found" value={counts?.signals ?? null} />
        <StatTile label="Scans run" value={counts?.scans ?? null} hint={counts?.scansFailed ? `${counts.scansFailed} failed` : undefined} />
        <StatTile label="Scan failure rate" value={counts?.scans ? `${Math.round(((counts.scansFailed ?? 0) / counts.scans) * 100)}%` : null} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Emails sent per day">
          <BarChart points={(series ?? []).map((d) => ({ label: short(d.day), value: d.emails_sent }))} />
        </Panel>
        <Panel title="Scans per day">
          <BarChart points={(series ?? []).map((d) => ({ label: short(d.day), value: d.scans }))} />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={`Signals by source, last ${days} days`}>
          <Table
            head={['Source', 'Signals', 'Avg score', 'Added as leads']}
            empty={sources && sources.length === 0 ? 'No signals in this range.' : undefined}
          >
            {(sources ?? []).map((s) => (
              <tr key={s.source}>
                <Td className="capitalize">{s.source}</Td>
                <Td className="font-mono">{s.signals}</Td>
                <Td className="font-mono">{s.avg_score}</Td>
                <Td className="font-mono">{s.leads}</Td>
              </tr>
            ))}
          </Table>
        </Panel>
        <Panel title={`Credits spent by action, last ${days} days`}>
          <RankBars
            rows={spent.map((u) => ({ label: u.reason, value: Math.abs(u.credits), sub: `${u.events}×` }))}
            empty="No credits spent in this range"
          />
        </Panel>
      </div>
    </>
  )
}
