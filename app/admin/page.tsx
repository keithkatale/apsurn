import { AreaChart, BarChart, FunnelBars } from '@/components/admin/Charts'
import { SetupNotice } from '@/components/admin/SetupNotice'
import { Panel, StatTile, usd } from '@/components/admin/ui'
import { safe } from '@/lib/admin/safe'
import {
  getBillingSummary,
  getDailySeries,
  getFunnel,
  getProductCounts,
  getUserCounts,
  parseRange,
} from '@/lib/admin/stats'
import { requireAdmin } from '@/lib/admin/access'

const short = (day: string) => day.slice(5)

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireAdmin()
  const days = parseRange((await searchParams).range)
  const [users, billing, product, series, funnel] = await Promise.all([
    safe(getUserCounts),
    safe(getBillingSummary),
    safe(getProductCounts),
    safe(() => getDailySeries(days)),
    safe(() => getFunnel(days)),
  ])

  const visitors = series?.reduce((s, d) => s + d.visitors, 0) ?? 0
  const pageviews = series?.reduce((s, d) => s + d.pageviews, 0) ?? 0
  const signups = series?.reduce((s, d) => s + d.new_users, 0) ?? 0
  const emails = series?.reduce((s, d) => s + d.emails_sent, 0) ?? 0

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-normal">Overview</h1>
        <p className="text-sm text-[var(--mh-muted)]">Last {days} days unless a tile says otherwise.</p>
      </div>

      {(!series || !funnel) && <SetupNotice />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Total users" value={users?.total ?? null} hint={users ? `${users.registered} registered · ${users.guests} guests` : undefined} />
        <StatTile label="New signups" value={users?.new_7d ?? null} hint={users ? `${users.new_30d} in 30 days` : undefined} />
        <StatTile label="Active users (7d)" value={users?.active_7d ?? null} hint={users ? `${users.active_1d} today · ${users.active_30d} in 30d` : undefined} />
        <StatTile label="Subscribers" value={billing?.subscribers ?? null} hint={billing ? `${billing.pastDue} past due · ${billing.cancelling} cancelling` : undefined} />
        <StatTile label="Est. MRR" value={billing ? usd(billing.mrr) : null} hint="From plan prices, not payouts" />
        <StatTile label="$1 unlocks" value={billing?.unlocks ?? null} hint="Trial purchases to date" />
        <StatTile label="Credits outstanding" value={billing?.creditsOutstanding ?? null} hint="Unspent, all accounts" />
        <StatTile label="Emails sent" value={product?.emailsSent ?? null} hint={series ? `${emails} in ${days} days` : undefined} />
        <StatTile label="Visitors" value={series ? visitors : null} hint={series ? `${pageviews.toLocaleString()} pageviews` : undefined} />
        <StatTile label="Signups (range)" value={series ? signups : null} />
        <StatTile label="Leads created" value={product?.leads ?? null} />
        <StatTile label="Signals found" value={product?.signals ?? null} hint={product?.scansFailed ? `${product.scansFailed} failed scans` : undefined} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Visitors per day" note={`${visitors.toLocaleString()} total`}>
          <AreaChart points={(series ?? []).map((d) => ({ label: short(d.day), value: d.visitors }))} />
        </Panel>
        <Panel title="New users per day" note={`${signups} total`}>
          <BarChart points={(series ?? []).map((d) => ({ label: short(d.day), value: d.new_users }))} />
        </Panel>
      </div>

      <Panel title="Conversion funnel" note="Distinct visitors or users who reached each step">
        {funnel ? <FunnelBars steps={funnel} /> : <p className="text-xs text-[var(--mh-muted)]">Waiting for analytics setup.</p>}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Plans" note={billing ? `${billing.accounts} billing accounts` : undefined}>
          {billing && billing.byPlan.length ? (
            <ul className="flex flex-col gap-1.5 text-sm">
              {billing.byPlan.map((p) => (
                <li key={p.plan} className="flex items-center justify-between">
                  <span className="capitalize">{p.plan}</span>
                  <span className="font-mono text-[var(--mh-muted)]">
                    {p.count} · {usd(p.mrr)}/mo
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[var(--mh-muted)]">No active subscribers yet.</p>
          )}
        </Panel>
        <Panel title="Product usage (all time)">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {[
              ['Workspaces', product?.workspaces],
              ['Campaigns', product?.campaigns],
              ['Connected inboxes', product?.inboxes],
              ['Scans run', product?.scans],
            ].map(([label, value]) => (
              <li key={String(label)} className="flex justify-between">
                <span className="text-[var(--mh-muted)]">{label}</span>
                <span className="font-mono">{value == null ? 'n/a' : Number(value).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  )
}
