import Link from 'next/link'
import { Panel, Pill, Table, Td, ago } from '@/components/admin/ui'
import { requireAdmin } from '@/lib/admin/access'
import { safe } from '@/lib/admin/safe'
import { getUsersPage } from '@/lib/admin/stats'

const PAGE_SIZE = 25

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdmin()
  const sp = await searchParams
  const q = (sp.q ?? '').slice(0, 100)
  const page = Math.max(1, Number(sp.page) || 1)
  const result = await safe(() => getUsersPage(q, page, PAGE_SIZE))
  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1
  const link = (p: number) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-normal">Users</h1>
          <p className="text-sm text-[var(--mh-muted)]">{result ? `${result.total.toLocaleString()} accounts` : 'Could not load users'}</p>
        </div>
        <form className="flex items-center gap-2" action="/admin/users">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search email"
            className="h-8 w-56 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-xs outline-none focus:border-[var(--mh-fg)]"
          />
          <button type="submit" className="h-8 rounded-[10px] bg-[var(--mh-fg)] px-3 text-xs font-medium text-[var(--mh-bg)]">
            Search
          </button>
        </form>
      </div>

      <Panel>
        <Table
          head={['Email', 'Type', 'Joined', 'Last seen', 'Plan', 'Credits', 'Leads', 'Emails sent', 'Signals']}
          empty={result && result.users.length === 0 ? 'No users match.' : undefined}
        >
          {(result?.users ?? []).map((u) => (
            <tr key={u.id}>
              <Td>{u.is_guest ? <span className="text-[var(--mh-muted)]">guest</span> : u.email}</Td>
              <Td>{u.is_guest ? <Pill>Guest</Pill> : <Pill tone="good">Registered</Pill>}</Td>
              <Td>{ago(u.created_at)}</Td>
              <Td>{ago(u.last_sign_in_at)}</Td>
              <Td>
                {u.plan_key ? (
                  <Pill tone={u.subscription_status === 'active' ? 'good' : 'warn'}>
                    {u.plan_key} · {u.subscription_status ?? '?'}
                  </Pill>
                ) : (
                  <span className="text-[var(--mh-muted)]">none</span>
                )}
              </Td>
              <Td className="font-mono">{u.credits.toLocaleString()}</Td>
              <Td className="font-mono">{u.leads}</Td>
              <Td className="font-mono">{u.sends}</Td>
              <Td className="font-mono">{u.signals}</Td>
            </tr>
          ))}
        </Table>
        {pages > 1 && (
          <nav className="mt-3 flex items-center justify-between text-xs text-[var(--mh-muted)]" aria-label="Pages">
            {page > 1 ? <Link href={link(page - 1)}>Previous</Link> : <span />}
            <span>
              Page {page} of {pages}
            </span>
            {page < pages ? <Link href={link(page + 1)}>Next</Link> : <span />}
          </nav>
        )}
      </Panel>
    </>
  )
}
