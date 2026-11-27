import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Static panel (no hover lift, unlike .project-card). */
export function Panel({ title, note, children, className }: { title?: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-4 sm:p-5', className)}>
      {(title || note) && (
        <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          {title && <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--mh-muted)]">{title}</h2>}
          {note && <p className="text-[11px] text-[var(--mh-muted)]">{note}</p>}
        </header>
      )}
      {children}
    </section>
  )
}

export function StatTile({ label, value, hint }: { label: string; value: string | number | null; hint?: string }) {
  return (
    <div className="rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-4">
      <p className="text-xs text-[var(--mh-muted)]">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-normal text-[var(--mh-fg)]">
        {value === null ? <span className="text-sm text-[var(--mh-muted)]">n/a</span> : typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-[var(--mh-muted)]">{hint}</p>}
    </div>
  )
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--mh-soft)] text-[var(--mh-muted)]">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-2.5 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-[var(--mh-fg)]">{children}</tbody>
      </table>
      {empty && <p className="py-8 text-center text-xs text-[var(--mh-muted)]">{empty}</p>}
    </div>
  )
}

export const Td = ({ children, className }: { children: ReactNode; className?: string }) => (
  <td className={cn('whitespace-nowrap border-b border-[var(--mh-soft)] px-2.5 py-2', className)}>{children}</td>
)

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const tones = {
    neutral: 'bg-[color:color-mix(in_srgb,var(--mh-fg)_9%,transparent)] text-[var(--mh-fg)]',
    good: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    bad: 'bg-red-500/15 text-red-700 dark:text-red-300',
  }
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', tones[tone])}>{children}</span>
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 60 / 24)}d ago`
}

export const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
