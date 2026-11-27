'use client'

import { ChevronLeft, CircleDot, Clock3, FileEdit, Gift, PauseCircle, Search, Zap } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { CompanyFavicon } from '@/components/prospects/CompanyFavicon'
import { ContactAvatar } from '@/components/prospects/ContactAvatar'
import type { Report, ReportLead, ReportSequence } from '@/lib/reports'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'active' | 'inactive'

function mergeValue(key: string, lead: ReportLead | undefined): string {
  const full = lead?.contactName ?? ''
  switch (key.toLowerCase()) {
    case 'first_name':
      return full.split(' ')[0] || 'there'
    case 'full_name':
      return full || 'there'
    case 'title':
      return lead?.contactTitle ?? 'your role'
    case 'email':
      return lead?.emailMasked ?? 'email'
    case 'company':
      return lead?.company ?? 'your company'
    case 'domain':
      return lead?.domain ?? 'your site'
    default:
      return key
  }
}

/** Plain text with {{merge_fields}} shown as chips filled with the selected person's details. */
function MergedText({ text, lead, multiline }: { text: string; lead: ReportLead | undefined; multiline?: boolean }) {
  const parts = text.split(/(\{\{\s*[a-z_]+\s*\}\})/gi)
  return (
    <p className={cn('text-[14px] leading-relaxed text-[var(--mh-fg)]', multiline && 'whitespace-pre-line')}>
      {parts.map((part, i) => {
        const m = /^\{\{\s*([a-z_]+)\s*\}\}$/i.exec(part)
        if (!m) return <Fragment key={i}>{part}</Fragment>
        return (
          <span
            key={i}
            className="mx-0.5 inline-flex items-center rounded-[6px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] px-1.5 py-px text-[12px] font-medium"
          >
            {mergeValue(m[1], lead)}
          </span>
        )
      })}
    </p>
  )
}

function CampaignCards({ report, onOpen }: { report: Report; onOpen: (id: string) => void }) {
  const [tab, setTab] = useState<Filter>('all')
  const campaigns = report.sequences
  const activeCount = campaigns.filter((c) => c.status === 'active').length
  const inactiveCount = campaigns.length - activeCount
  const filtered = campaigns.filter((c) => (tab === 'active' ? c.status === 'active' : tab === 'inactive' ? c.status !== 'active' : true))

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mh-soft)] pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="font-display truncate text-lg font-semibold tracking-tight text-[var(--mh-fg)] sm:text-xl">Campaigns</h1>
            <span className="hidden font-mono text-[11px] text-[var(--mh-muted)] sm:inline">
              · {campaigns.length} total · {activeCount} active · {inactiveCount} paused
            </span>
          </div>
          <p className="text-xs text-[var(--mh-muted)]">Personalized outbound sequences tailored from the ICP.</p>
        </div>
        <div className="flex items-center gap-1 rounded-[10px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)] p-1 text-xs font-medium">
          {[
            { id: 'all', label: `All (${campaigns.length})` },
            { id: 'active', label: `Active (${activeCount})` },
            { id: 'inactive', label: `Inactive (${inactiveCount})` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id as Filter)}
              className={cn(
                'rounded-[8px] px-3 py-1 transition-colors',
                tab === t.id ? 'bg-[var(--mh-fg)] text-[var(--mh-bg)]' : 'text-[var(--mh-muted)] hover:text-[var(--mh-fg)]',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="project-card flex flex-col items-center justify-center gap-3 rounded-[10px] p-14 text-center">
          <Gift className="size-8 text-[var(--mh-muted)]" />
          <h2 className="font-display text-xl font-normal text-[var(--mh-fg)]">No campaigns in this view</h2>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((campaign, campIdx) => {
            const isActive = campaign.status === 'active'
            const StatusIcon = isActive ? CircleDot : campaign.status === 'paused' ? PauseCircle : FileEdit
            const sample = report.leads.slice(campIdx * 3, campIdx * 3 + 4)
            const previewRows = sample.length ? sample : report.leads.slice(0, 4)
            return (
              <article
                key={campaign.id}
                onClick={() => onOpen(campaign.id)}
                className="project-card group flex cursor-pointer flex-col justify-between overflow-hidden rounded-[10px] p-5 transition-all hover:-translate-y-0.5"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-0.5 text-[11px] font-medium',
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : 'bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] text-[var(--mh-muted)]',
                      )}
                    >
                      <StatusIcon className="size-3" />
                      <span>{isActive ? 'Active' : 'Inactive'}</span>
                    </span>
                    <span className="font-mono text-[11px] text-[var(--mh-muted)]">
                      {report.leadTotal} contacts · {campaign.steps.length || 3} steps
                    </span>
                  </div>
                  <h2 className="font-display mt-3 text-lg font-normal leading-snug tracking-[-0.02em] text-[var(--mh-fg)]">{campaign.name}</h2>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--mh-muted)]">{campaign.hook}</p>
                </div>

                {previewRows.length > 0 && (
                  <div className="mt-4 overflow-hidden rounded-[8px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)]">
                    <div className="grid grid-cols-2 border-b border-[var(--mh-soft)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--mh-muted)]">
                      <span>Company</span>
                      <span>Name</span>
                    </div>
                    <ul className="divide-y divide-[var(--mh-soft)]">
                      {previewRows.map((person) => (
                        <li key={person.id} className="grid grid-cols-2 items-center gap-2 px-3 py-1.5 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5 text-[var(--mh-muted)]">
                            <CompanyFavicon domain={person.domain} name={person.company} className="size-6 shrink-0" />
                            <span className="truncate font-medium text-[var(--mh-fg)]">{person.company}</span>
                          </span>
                          <span className="flex min-w-0 items-center gap-2">
                            <ContactAvatar name={person.contactName ?? ''} linkedinUrl={person.linkedinUrl} email={null} className="size-5 shrink-0 rounded-full" />
                            <span className="truncate text-[var(--mh-muted)]">{person.contactName ?? '—'}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CampaignDetail({ report, campaign, onBack }: { report: Report; campaign: ReportSequence; onBack: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(report.leads[0]?.id ?? null)
  const [filter, setFilter] = useState('')
  const people = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return q ? report.leads.filter((p) => [p.contactName, p.contactTitle, p.company].filter(Boolean).join(' ').toLowerCase().includes(q)) : report.leads
  }, [report.leads, filter])
  const selected = report.leads.find((p) => p.id === selectedId) ?? report.leads[0]
  const [opener, ...followups] = campaign.steps

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--mh-soft)] pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-[var(--mh-soft)] px-2.5 py-1 text-xs font-medium text-[var(--mh-muted)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] hover:text-[var(--mh-fg)]"
          >
            <ChevronLeft className="size-3.5" />
            <span>Campaigns</span>
          </button>
          <Gift className="size-4 shrink-0 text-[var(--mh-fg)]" strokeWidth={1.8} />
          <div className="min-w-0">
            <h1 className="font-display truncate text-[18px] font-semibold leading-tight tracking-[-0.025em] text-[var(--mh-fg)]">{campaign.name}</h1>
            {campaign.hook && <p className="truncate text-[11px] leading-tight text-[var(--mh-muted)]">{campaign.hook}</p>}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 bg-[radial-gradient(color-mix(in_srgb,var(--mh-fg)_12%,transparent)_1px,transparent_1px)] [background-size:16px_16px] md:flex-row">
        {/* PEOPLE */}
        <section className="project-card flex max-h-[70vh] w-full shrink-0 flex-col overflow-hidden rounded-[10px] bg-[var(--mh-card-bg)] md:w-[320px]">
          <div className="shrink-0 border-b border-[var(--mh-soft)] px-4 py-3.5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--mh-fg)]">PEOPLE</p>
            <p className="text-[12px] text-[var(--mh-muted)]">{report.leadTotal} in this campaign</p>
          </div>
          {report.leads.length > 8 && (
            <div className="border-b border-[var(--mh-soft)] px-3 py-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-[var(--mh-muted)]" />
                <input
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter people…"
                  className="h-7 w-full rounded-[8px] bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] pl-7 pr-2 text-xs text-[var(--mh-fg)] outline-none placeholder:text-[var(--mh-muted)]"
                />
              </div>
            </div>
          )}
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {people.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(person.id)}
                  className={cn(
                    'mb-1 flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors',
                    person.id === selected?.id ? 'bg-[color:color-mix(in_srgb,var(--mh-fg)_9%,transparent)]' : 'hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)]',
                  )}
                >
                  <ContactAvatar name={person.contactName ?? ''} linkedinUrl={person.linkedinUrl} email={null} className="mt-0.5 size-9 rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-snug text-[var(--mh-fg)]">{person.contactName || 'Unknown'}</span>
                    <span className="mt-0.5 block truncate text-[12px] leading-snug text-[var(--mh-muted)]">{person.contactTitle || 'Decision Maker'}</span>
                    <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-[var(--mh-muted)]">
                      <CompanyFavicon domain={person.domain} name={person.company} className="size-6 rounded-md" />
                      <span className="truncate">{person.company}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Composer */}
        <section className="flex min-w-0 flex-1 flex-col md:px-2">
          {opener ? (
            <article className="project-card w-full shrink-0 overflow-hidden rounded-[10px] bg-[var(--mh-card-bg)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)] px-6 py-4">
                {selected ? (
                  <div className="flex min-w-0 items-center gap-3.5">
                    <ContactAvatar name={selected.contactName ?? ''} linkedinUrl={selected.linkedinUrl} email={null} className="size-11 rounded-full" />
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-[var(--mh-fg)]">{selected.contactName}</p>
                      <p className="truncate text-[12px] text-[var(--mh-muted)]">{[selected.contactTitle, selected.company].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                ) : (
                  <span />
                )}
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden font-mono text-[12px] text-[var(--mh-muted)] md:inline">{report.company.name}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] px-3 py-1 text-[11px] font-medium text-[var(--mh-fg)]">
                    <Zap className="size-3" />
                    Sends immediately
                  </span>
                </div>
              </div>
              <div className="px-6 py-2">
                <div className="flex items-center gap-4 border-b border-[var(--mh-soft)] py-3">
                  <span className="w-10 shrink-0 font-mono text-[12px] text-[var(--mh-muted)]">To</span>
                  <span className="min-w-0 truncate text-[14px] text-[var(--mh-fg)]">{selected?.emailMasked ?? 'verified-contact@company.com'}</span>
                </div>
                <div className="flex items-center gap-4 border-b border-[var(--mh-soft)] py-3">
                  <span className="w-10 shrink-0 font-mono text-[12px] text-[var(--mh-muted)]">Subj</span>
                  <div className="min-w-0 flex-1">
                    <MergedText text={opener.subject} lead={selected} />
                  </div>
                </div>
                <div className="py-4">
                  <MergedText text={opener.body} lead={selected} multiline />
                </div>
              </div>
            </article>
          ) : (
            <p className="text-sm text-[var(--mh-muted)]">This campaign has no steps.</p>
          )}

          {followups.map((step) => (
            <div key={step.order} className="flex flex-col items-stretch">
              <div className="flex flex-col items-center py-1" aria-hidden>
                <div className="h-5 w-px border-l border-dashed border-[var(--mh-soft)]" />
              </div>
              <article className="project-card w-full shrink-0 overflow-hidden rounded-[10px] bg-[var(--mh-card-bg)]">
                <div className="flex items-center justify-between gap-2 border-b border-[var(--mh-soft)] px-5 py-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] px-3 py-1 text-[11px] font-medium text-[var(--mh-muted)]">
                    <Clock3 className="size-3" />
                    Waits {step.delayDays} days, if no reply
                  </span>
                </div>
                <div className="px-6 py-3">
                  <div className="flex items-center gap-4 border-b border-[var(--mh-soft)] py-2">
                    <span className="w-10 shrink-0 font-mono text-[12px] text-[var(--mh-muted)]">Subj</span>
                    <div className="min-w-0 flex-1">
                      <MergedText text={step.subject} lead={selected} />
                    </div>
                  </div>
                  <div className="py-3">
                    <MergedText text={step.body} lead={selected} multiline />
                  </div>
                </div>
              </article>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

/** The main app's Campaigns view, read-only: a grid of campaign cards that open into the sequence. */
export function ReportCampaigns({ report }: { report: Report }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = report.sequences.find((s) => s.id === openId)
  if (open) return <CampaignDetail report={report} campaign={open} onBack={() => setOpenId(null)} />
  return <CampaignCards report={report} onOpen={setOpenId} />
}
