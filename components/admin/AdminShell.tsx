'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/subscribers', label: 'Subscribers' },
  { href: '/admin/traffic', label: 'Traffic' },
  { href: '/admin/activity', label: 'Activity' },
  { href: '/admin/product', label: 'Product' },
  { href: '/admin/reports', label: 'Reports' },
]

const RANGES = [7, 30, 90]

function RangeSwitch() {
  const params = useSearchParams()
  const pathname = usePathname()
  const current = Number(params.get('range')) || 30
  return (
    <div className="flex items-center gap-1 rounded-[10px] border border-[var(--mh-soft)] p-0.5 text-xs">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`${pathname}?range=${r}`}
          className={cn(
            'rounded-[8px] px-2.5 py-1 font-medium transition-colors',
            current === r ? 'bg-[var(--mh-fg)] text-[var(--mh-bg)]' : 'text-[var(--mh-muted)] hover:text-[var(--mh-fg)]',
          )}
        >
          {r}d
        </Link>
      ))}
    </div>
  )
}

export function AdminShell({ email, children }: { email: string; children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div className="marketing-home min-h-screen bg-[var(--mh-bg)] text-[var(--mh-fg)]">
      <header className="border-b border-[var(--mh-soft)]">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="font-display text-lg text-[var(--mh-fg)]">
              apsurn <span className="text-[var(--mh-muted)]">admin</span>
            </Link>
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Private · not indexed
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Suspense fallback={null}>
              <RangeSwitch />
            </Suspense>
            <span className="hidden text-xs text-[var(--mh-muted)] sm:inline">{email}</span>
            <Link href="/leads" className="text-xs text-[var(--mh-muted)] hover:text-[var(--mh-fg)]">
              Back to app
            </Link>
          </div>
        </div>
        <nav className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Admin sections">
          {TABS.map((t) => {
            const active = t.href === '/admin' ? pathname === '/admin' : pathname.startsWith(t.href)
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
                  active ? 'border-[var(--mh-fg)] font-medium text-[var(--mh-fg)]' : 'border-transparent text-[var(--mh-muted)] hover:text-[var(--mh-fg)]',
                )}
              >
                {t.label}
              </Link>
            )
          })}
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}
