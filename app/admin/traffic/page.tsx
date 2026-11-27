import { AreaChart, BarChart, RankBars } from '@/components/admin/Charts'
import { SetupNotice } from '@/components/admin/SetupNotice'
import { Panel, StatTile } from '@/components/admin/ui'
import { requireAdmin } from '@/lib/admin/access'
import { safe } from '@/lib/admin/safe'
import { getDailySeries, getTop, parseRange } from '@/lib/admin/stats'

export default async function AdminTraffic({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireAdmin()
  const days = parseRange((await searchParams).range)
  const [series, pages, referrers, devices] = await Promise.all([
    safe(() => getDailySeries(days)),
    safe(() => getTop(days, 'path', 12)),
    safe(() => getTop(days, 'referrer', 12)),
    safe(() => getTop(days, 'device', 5)),
  ])
  const visitors = series?.reduce((s, d) => s + d.visitors, 0) ?? 0
  const views = series?.reduce((s, d) => s + d.pageviews, 0) ?? 0
  const short = (d: string) => d.slice(5)

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-normal">Traffic</h1>
        <p className="text-sm text-[var(--mh-muted)]">First-party pageviews from the last {days} days. Bots, localhost and admin pages are excluded; no IP addresses are stored.</p>
      </div>

      {!series && <SetupNotice />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Visitors" value={series ? visitors : null} hint="Sum of daily unique visitors" />
        <StatTile label="Pageviews" value={series ? views : null} />
        <StatTile label="Pages per visitor" value={series && visitors ? (views / visitors).toFixed(1) : null} />
        <StatTile label="Signups" value={series ? series.reduce((s, d) => s + d.new_users, 0) : null} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Visitors per day">
          <AreaChart points={(series ?? []).map((d) => ({ label: short(d.day), value: d.visitors }))} />
        </Panel>
        <Panel title="Pageviews per day">
          <BarChart points={(series ?? []).map((d) => ({ label: short(d.day), value: d.pageviews }))} />
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Top pages">
          <RankBars rows={(pages ?? []).map((p) => ({ label: p.value, value: p.hits, sub: `${p.visitors} visitors` }))} empty="No pageviews yet" />
        </Panel>
        <Panel title="Top referrers">
          <RankBars rows={(referrers ?? []).map((r) => ({ label: r.value, value: r.hits, sub: `${r.visitors} visitors` }))} empty="No pageviews yet" />
        </Panel>
        <Panel title="Devices">
          <RankBars rows={(devices ?? []).map((d) => ({ label: d.value, value: d.hits }))} empty="No pageviews yet" />
        </Panel>
      </div>
    </>
  )
}
