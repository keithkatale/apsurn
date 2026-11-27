'use client'

import { ExternalLink, Globe, Lock, Search, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CompanyFavicon } from '@/components/prospects/CompanyFavicon'
import { ContactAvatar } from '@/components/prospects/ContactAvatar'
import type { Report } from '@/lib/reports'
import { cn } from '@/lib/utils'

function fitTier(score: number) {
  if (score >= 75) return { short: 'T1', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' }
  if (score >= 55) return { short: 'T2', cls: 'bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] text-[var(--mh-fg)]' }
  return { short: 'T3', cls: 'bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] text-[var(--mh-muted)]' }
}

type TabId = 'all' | 't1' | 't2' | 't3'

/** The main app's lead table, read-only. Emails and phone numbers are masked until the list is kept. */
export function ReportLeadsTable({ report }: { report: Report }) {
  const leads = report.leads
  const [activeTab, setActiveTab] = useState<TabId>('all')
  const [query, setQuery] = useState('')
  const [industry, setIndustry] = useState('all')

  const industries = useMemo(() => Array.from(new Set(leads.map((l) => l.industry).filter((v): v is string => Boolean(v)))).sort(), [leads])
  const counts = useMemo(
    () => ({
      all: leads.length,
      t1: leads.filter((l) => l.score >= 75).length,
      t2: leads.filter((l) => l.score >= 55 && l.score < 75).length,
      t3: leads.filter((l) => l.score < 55).length,
    }),
    [leads],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return leads.filter((l) => {
      if (activeTab === 't1' && l.score < 75) return false
      if (activeTab === 't2' && (l.score < 55 || l.score >= 75)) return false
      if (activeTab === 't3' && l.score >= 55) return false
      if (industry !== 'all' && l.industry !== industry) return false
      if (!q) return true
      return [l.company, l.contactName, l.contactTitle, l.industry, l.location, l.whatTheyDo, l.howWeCanHelp].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [leads, activeTab, query, industry])

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 't1', label: 'Tier 1 · High Fit' },
    { id: 't2', label: 'Tier 2' },
    { id: 't3', label: 'Tier 3' },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <Table2 className="size-4 self-center text-[var(--mh-muted)]" />
        <h1 className="font-display text-lg font-normal text-[var(--mh-fg)]">Leads</h1>
        <span className="font-mono text-[11px] text-[var(--mh-muted)]">
          · {report.leadTotal} contacts{leads.length < report.leadTotal ? `, showing the top ${leads.length}` : ''}
        </span>
      </div>

      <div className="project-card overflow-hidden rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_2%,transparent)] px-3.5 py-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'bg-[var(--mh-fg)] text-[var(--mh-bg)] shadow-xs'
                      : 'text-[var(--mh-muted)] hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] hover:text-[var(--mh-fg)]',
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      'rounded-[6px] px-1.5 font-mono text-[10px]',
                      active ? 'bg-[var(--mh-bg)]/20 text-[var(--mh-bg)]' : 'bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] text-[var(--mh-muted)]',
                    )}
                  >
                    {counts[tab.id]}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-48 sm:w-60">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--mh-muted)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search leads…"
                className="h-7 w-full rounded-[8px] border border-[var(--mh-soft)] bg-[var(--mh-bg)] pl-8 pr-2.5 text-xs text-[var(--mh-fg)] outline-none placeholder:text-[var(--mh-muted)] focus:border-[var(--mh-fg)]/40"
              />
            </div>
            {industries.length > 0 && (
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                aria-label="Filter by industry"
                className="h-7 rounded-[8px] border border-[var(--mh-soft)] bg-[var(--mh-bg)] px-2 text-xs font-medium text-[var(--mh-fg)] outline-none"
              >
                <option value="all">All industries ({industries.length})</option>
                {industries.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2.5 p-12 text-center">
            <Table2 className="size-8 text-[var(--mh-muted)]" />
            <h2 className="font-display text-lg font-normal text-[var(--mh-fg)]">No leads match this view</h2>
            <p className="max-w-md text-xs text-[var(--mh-muted)]">Try another tier or clear the search.</p>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[1300px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)] font-mono text-[11px] uppercase tracking-wider text-[var(--mh-muted)]">
                  <th className="w-9 px-2 py-3 text-center font-medium">#</th>
                  <th className="min-w-[175px] px-3 py-3 font-medium">Company</th>
                  <th className="min-w-[205px] px-3 py-3 font-medium">Name</th>
                  <th className="min-w-[185px] px-3 py-3 font-medium">Email</th>
                  <th className="min-w-[120px] px-3 py-3 font-medium">Phone</th>
                  <th className="w-24 px-3 py-3 font-medium">LinkedIn</th>
                  <th className="min-w-[130px] px-3 py-3 font-medium">Website</th>
                  <th className="min-w-[130px] px-3 py-3 font-medium">Location</th>
                  <th className="min-w-[240px] px-3 py-3 font-medium">What they do</th>
                  <th className="min-w-[260px] px-3 py-3 font-medium">How we can help</th>
                  <th className="min-w-[120px] whitespace-nowrap bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] px-3.5 py-3 font-semibold text-[var(--mh-fg)]">
                    Scoring
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--mh-soft)]">
                {filtered.map((lead, idx) => {
                  const badge = fitTier(lead.score)
                  const name = lead.contactName || 'Decision Maker'
                  return (
                    <tr key={lead.id} className="align-top transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)]">
                      <td className="px-2 py-3.5 text-center font-mono text-[11px] text-[var(--mh-muted)]">{idx + 1}</td>

                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2.5 text-left">
                          <CompanyFavicon domain={lead.domain} name={lead.company} className="size-8 shrink-0 rounded-[8px]" />
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate font-medium text-[var(--mh-fg)]">{lead.company}</span>
                            <span className="truncate text-[11px] text-[var(--mh-muted)]">
                              {[lead.industry, lead.size ? `${lead.size} emp` : null].filter(Boolean).join(' · ') || '—'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3.5">
                        <div className="flex items-start gap-2.5 text-left">
                          <ContactAvatar name={name} linkedinUrl={lead.linkedinUrl} email={null} className="mt-0.5 size-8 rounded-full" />
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate font-semibold text-[var(--mh-fg)]">{name}</span>
                            <span className="line-clamp-1 text-[11px] text-[var(--mh-muted)]">{lead.contactTitle || '—'}</span>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3.5">
                        {lead.emailMasked ? (
                          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--mh-fg)]" title="Shown in full when you keep this list">
                            {lead.emailMasked}
                            <Lock className="size-3 text-[var(--mh-muted)]" aria-hidden />
                          </span>
                        ) : (
                          <span className="text-[var(--mh-muted)]/40">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3.5 font-mono text-[11px] text-[var(--mh-muted)]">
                        {lead.phoneMasked ? (
                          <span className="inline-flex items-center gap-1.5" title="Shown in full when you keep this list">
                            {lead.phoneMasked}
                            <Lock className="size-3" aria-hidden />
                          </span>
                        ) : (
                          <span className="text-[var(--mh-muted)]/40">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3.5">
                        {lead.linkedinUrl ? (
                          <a
                            href={lead.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-[var(--mh-soft)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--mh-fg)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)]"
                          >
                            <span>Profile</span>
                            <ExternalLink className="size-2.5" />
                          </a>
                        ) : (
                          <span className="text-[var(--mh-muted)]/40">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3.5">
                        {lead.domain ? (
                          <a
                            href={lead.website || `https://${lead.domain}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-[125px] items-center gap-1 truncate font-mono text-[11px] text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
                          >
                            <Globe className="size-3 shrink-0" />
                            <span className="truncate">{lead.domain}</span>
                            <ExternalLink className="size-2.5 shrink-0 opacity-60" />
                          </a>
                        ) : (
                          <span className="text-[var(--mh-muted)]/40">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3.5 text-[11px] text-[var(--mh-muted)]">
                        <span className="line-clamp-2">{lead.location || '—'}</span>
                      </td>

                      <td className="px-3 py-3.5 text-[11px] leading-relaxed text-[var(--mh-muted)]">
                        <p className="line-clamp-2" title={lead.whatTheyDo}>
                          {lead.whatTheyDo}
                        </p>
                      </td>

                      <td className="px-3 py-3.5 text-[11px] leading-relaxed text-[var(--mh-fg)]">
                        <p className="line-clamp-2" title={lead.howWeCanHelp}>
                          {lead.howWeCanHelp}
                        </p>
                      </td>

                      <td className="whitespace-nowrap bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)] px-3.5 py-3.5">
                        <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium', badge.cls)}>
                          {badge.short} · {lead.score}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
