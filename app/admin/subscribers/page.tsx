import { Panel, Pill, StatTile, Table, Td, ago, usd } from '@/components/admin/ui'
import { requireAdmin } from '@/lib/admin/access'
import { safe } from '@/lib/admin/safe'
import { getBillingSummary, getCreditUsage, getSubscribers, parseRange } from '@/lib/admin/stats'

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'n/a')

export default async function AdminSubscribers({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireAdmin()
  const days = parseRange((await searchParams).range)
  const [summary, rows, usage] = await Promise.all([
    safe(getBillingSummary),
    safe(getSubscribers),
    safe(() => getCreditUsage(days)),
  ])

  return (
    <>
      <div>
        <h1 className="font-display text-2xl font-normal">Subscribers and billing</h1>
        <p className="text-sm text-[var(--mh-muted)]">Revenue figures are estimated from plan prices. Dodo remains the source of truth for payouts.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Active subscribers" value={summary?.subscribers ?? null} />
        <StatTile label="Est. MRR" value={summary ? usd(summary.mrr) : null} />
        <StatTile label="Past due" value={summary?.pastDue ?? null} hint="Payment failed, in grace period" />
        <StatTile label="Cancelling" value={summary?.cancelling ?? null} hint="Ends at period end" />
        <StatTile label="$1 unlocks" value={summary?.unlocks ?? null} />
        <StatTile label="Billing accounts" value={summary?.accounts ?? null} />
        <StatTile label="Credits outstanding" value={summary?.creditsOutstanding ?? null} />
      </div>

      <Panel title="Accounts" note="Newest first, up to 500">
        <Table
          head={['Email', 'Plan', 'Status', 'Renews / ends', 'Credits', 'Since']}
          empty={rows && rows.length === 0 ? 'No billing accounts yet.' : undefined}
        >
          {(rows ?? []).map((r) => (
            <tr key={r.user_id}>
              <Td>{r.email || r.user_id.slice(0, 8)}</Td>
              <Td className="capitalize">{r.plan_key ?? 'none (unlock only)'}</Td>
              <Td>
                {r.subscription_status ? (
                  <Pill tone={r.subscription_status === 'active' ? 'good' : r.subscription_status === 'past_due' ? 'warn' : 'bad'}>
                    {r.subscription_status}
                    {r.cancel_at_period_end ? ' · cancelling' : ''}
                  </Pill>
                ) : (
                  <span className="text-[var(--mh-muted)]">n/a</span>
                )}
              </Td>
              <Td>{when(r.current_period_end)}</Td>
              <Td className="font-mono">{r.credits.toLocaleString()}</Td>
              <Td>{ago(r.created_at)}</Td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Panel title={`Credit movements, last ${days} days`} note="Positive = granted, negative = spent">
        <Table head={['Reason', 'Entries', 'Net credits']} empty={usage && usage.length === 0 ? 'No credit activity in this range.' : undefined}>
          {(usage ?? []).map((u) => (
            <tr key={u.reason}>
              <Td>{u.reason}</Td>
              <Td className="font-mono">{u.events.toLocaleString()}</Td>
              <Td className="font-mono">{u.credits.toLocaleString()}</Td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  )
}
