'use client'

import { Check, Copy, Download, ExternalLink, Globe, Phone, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ContactAvatar } from '@/components/prospects/ContactAvatar'
import { CONTACT_CREDITS, contactCostLabel } from '@/lib/billing/plans'
import type { ListenResponse, ScoredPost } from '@/lib/types'
import { cn } from '@/lib/utils'

function cleanCompanySummary(post: ScoredPost): string {
  const lines = post.text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const desc = lines.find((l) => l.length > 45 && !l.startsWith('Keywords:') && !l.includes('employees ·'))
  if (desc) return desc
  if (post.lead?.companyIndustry) {
    return `${post.lead.companyIndustry}${post.lead.companySize ? ` (${post.lead.companySize})` : ''} organization`
  }
  return lines[0] || 'B2B organization matching your ICP'
}

function cleanDomain(url: string | null | undefined): string | null {
  if (!url) return null
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || null
}

function tierBadge(score: number) {
  if (score >= 80) {
    return {
      label: `T1 · ${score}`,
      cls: 'bg-[var(--mh-fg)] text-[var(--mh-bg)]',
    }
  }
  if (score >= 60) {
    return {
      label: `T2 · ${score}`,
      cls: 'border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] text-[var(--mh-fg)]',
    }
  }
  return {
    label: `T3 · ${score}`,
    cls: 'border border-[var(--mh-soft)] text-[var(--mh-muted)]',
  }
}

function toCsv(data: ScoredPost[]) {
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const header = [
    'rank',
    'score',
    'name',
    'title',
    'company',
    'email',
    'phone',
    'linkedin',
    'website',
    'location',
    'what_they_do',
    'how_we_can_help',
  ]
  const rows = data.map((p, idx) =>
    [
      idx + 1,
      p.score,
      p.lead?.fullName ?? p.author ?? '',
      p.lead?.jobTitle ?? '',
      p.lead?.companyName ?? p.community ?? '',
      p.lead?.email ?? '',
      p.lead?.phone ?? '',
      p.lead?.linkedinUrl ?? '',
      p.lead?.companyWebsite ?? '',
      p.lead?.location ?? '',
      cleanCompanySummary(p),
      p.outreachAngle || p.reason || '',
    ]
      .map(escape)
      .join(','),
  )
  return [header.join(','), ...rows].join('\n')
}

export function LeadsTable({ data }: { data: ListenResponse }) {
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState<'all' | 't1' | 't2'>('all')
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.posts.filter((p) => {
      if (tier === 't1' && p.score < 80) return false
      if (tier === 't2' && p.score < 60) return false
      if (!q) return true
      const haystack = [
        p.lead?.fullName,
        p.lead?.jobTitle,
        p.lead?.companyName,
        p.lead?.email,
        p.lead?.location,
        p.lead?.companyIndustry,
        p.text,
        p.outreachAngle,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [data.posts, query, tier])

  const downloadCsv = () => {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${data.scannedAt.slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email).catch(() => {})
    setCopiedEmail(email)
    setTimeout(() => setCopiedEmail(null), 1500)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[var(--mh-muted)]">
        {data.posts.length} contacts found = {data.posts.length * CONTACT_CREDITS} credits. {contactCostLabel()}.
      </p>
      {/* Minimalist Table Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--mh-muted)]" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, company, role, location…"
              className="h-9 w-64 rounded-full border border-[var(--mh-soft)] bg-[var(--mh-bg)] pl-9 pr-4 text-xs text-[var(--mh-fg)] outline-none placeholder:text-[var(--mh-muted)] sm:w-72"
            />
          </div>

          <div className="flex items-center gap-1 rounded-full border border-[var(--mh-soft)] bg-[var(--mh-bg)] p-1 text-xs">
            {[
              { id: 'all', label: `All (${data.posts.length})` },
              { id: 't1', label: 'T1 Accounts (80+)' },
              { id: 't2', label: 'T1 + T2 (60+)' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTier(t.id as 'all' | 't1' | 't2')}
                className={cn(
                  'rounded-full px-3 py-1 font-medium transition-colors',
                  tier === t.id
                    ? 'bg-[var(--mh-fg)] text-[var(--mh-bg)]'
                    : 'text-[var(--mh-muted)] hover:text-[var(--mh-fg)]',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={downloadCsv}
          disabled={!filtered.length}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--mh-soft)] bg-[var(--mh-bg)] px-4 text-xs font-medium text-[var(--mh-fg)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] disabled:opacity-50"
        >
          <Download className="size-3.5" aria-hidden />
          Export CSV ({filtered.length})
        </button>
      </div>

      {/* Spreadsheet Table Styled in Landing Page Theme */}
      <div className="project-card overflow-hidden rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1340px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)] text-[11px] font-medium text-[var(--mh-muted)]">
                <th className="w-10 px-3 py-3.5 text-center font-mono">#</th>
                <th className="min-w-[175px] px-3 py-3.5">Company</th>
                <th className="min-w-[185px] px-3 py-3.5">Name</th>
                <th className="min-w-[185px] px-3 py-3.5">Email</th>
                <th className="min-w-[125px] px-3 py-3.5">Phone</th>
                <th className="w-24 px-3 py-3.5">LinkedIn</th>
                <th className="min-w-[130px] px-3 py-3.5">Website</th>
                <th className="min-w-[135px] px-3 py-3.5">Location</th>
                <th className="min-w-[230px] px-3 py-3.5">What they do</th>
                <th className="min-w-[240px] bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)] px-3.5 py-3.5 font-semibold text-[var(--mh-fg)]">
                  How we can help
                </th>
                <th className="min-w-[120px] whitespace-nowrap bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)] px-3.5 py-3.5 text-right font-semibold text-[var(--mh-fg)]">
                  Scoring
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--mh-soft)]">
              {filtered.map((post, idx) => {
                const lead = post.lead
                const name = lead?.fullName || post.author || 'Unknown'
                const jobTitle = lead?.jobTitle || 'Decision Maker'
                const company = lead?.companyName || post.community || '—'
                const domain = cleanDomain(lead?.companyWebsite) || (lead?.email ? lead.email.split('@')[1] : null)
                const whatTheyDo = cleanCompanySummary(post)
                const howWeHelp =
                  post.outreachAngle ||
                  post.reason ||
                  `Tailored fit for ${jobTitle} at ${company}`
                const badge = tierBadge(post.score)
                const primaryPhone = lead?.phone ? lead.phone.split(',')[0].trim() : null

                return (
                  <tr
                    key={post.id}
                    className="group transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_2.5%,transparent)]"
                  >
                    {/* # */}
                    <td className="px-3 py-3 text-center font-mono text-[11px] text-[var(--mh-muted)]">
                      {idx + 1}
                    </td>

                    {/* Company */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {domain ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
                            alt=""
                            className="size-8 shrink-0 rounded-[8px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)] object-contain p-1"
                            onError={(e) => {
                              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        ) : null}
                        <div className="min-w-0">
                          <div className="truncate max-w-[145px] font-medium text-[var(--mh-fg)]" title={company}>
                            {company}
                          </div>
                          {(lead?.companyIndustry || lead?.companySize) && (
                            <div className="truncate max-w-[145px] text-[10px] text-[var(--mh-muted)]">
                              {[lead.companyIndustry, lead.companySize].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Name & Role with Profile Picture */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <ContactAvatar
                          name={name}
                          linkedinUrl={lead?.linkedinUrl}
                          email={lead?.email}
                          className="size-8 shrink-0 rounded-full"
                        />
                        <div className="min-w-0">
                          <div className="truncate max-w-[155px] font-medium text-[var(--mh-fg)]" title={name}>
                            {name}
                          </div>
                          <div className="mt-0.5 truncate max-w-[155px] text-[11px] text-[var(--mh-muted)]" title={jobTitle}>
                            {jobTitle}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-3 py-3 font-mono text-[11px]">
                      {lead?.email ? (
                        <div className="flex items-center gap-1.5">
                          <a
                            href={`mailto:${lead.email}`}
                            className="truncate max-w-[160px] text-[var(--mh-fg)] hover:underline"
                            title={lead.email}
                          >
                            {lead.email}
                          </a>
                          <button
                            type="button"
                            onClick={() => copyEmail(lead.email!)}
                            className="opacity-0 transition-opacity group-hover:opacity-100 text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
                            aria-label="Copy email"
                          >
                            {copiedEmail === lead.email ? (
                              <Check className="size-3" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[var(--mh-muted)]/40">—</span>
                      )}
                    </td>

                    {/* Phone */}
                    <td className="px-3 py-3 font-mono text-[11px]">
                      {primaryPhone ? (
                        <a
                          href={`tel:${primaryPhone}`}
                          className="inline-flex items-center gap-1 text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
                        >
                          <Phone className="size-3 shrink-0 opacity-60" aria-hidden />
                          <span>{primaryPhone}</span>
                        </a>
                      ) : (
                        <span className="text-[var(--mh-muted)]/40">—</span>
                      )}
                    </td>

                    {/* LinkedIn */}
                    <td className="px-3 py-3">
                      {lead?.linkedinUrl ? (
                        <a
                          href={lead.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-[var(--mh-soft)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--mh-fg)] hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)]"
                        >
                          <span>Profile</span>
                          <ExternalLink className="size-2.5 opacity-70" aria-hidden />
                        </a>
                      ) : (
                        <span className="text-[var(--mh-muted)]/40">—</span>
                      )}
                    </td>

                    {/* Website */}
                    <td className="px-3 py-3 font-mono text-[11px]">
                      {domain ? (
                        <a
                          href={lead?.companyWebsite || `https://${domain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 truncate max-w-[125px] text-[var(--mh-muted)] hover:text-[var(--mh-fg)] hover:underline"
                          title={domain}
                        >
                          <Globe className="size-3 shrink-0 opacity-60" aria-hidden />
                          <span className="truncate">{domain}</span>
                        </a>
                      ) : (
                        <span className="text-[var(--mh-muted)]/40">—</span>
                      )}
                    </td>

                    {/* Location */}
                    <td className="px-3 py-3 text-[var(--mh-muted)]">
                      <span className="line-clamp-1 max-w-[135px]" title={lead?.location ?? ''}>
                        {lead?.location || '—'}
                      </span>
                    </td>

                    {/* What they do */}
                    <td className="px-3 py-3 text-[var(--mh-muted)]">
                      <p className="line-clamp-2 max-w-[240px] leading-relaxed" title={whatTheyDo}>
                        {whatTheyDo}
                      </p>
                    </td>

                    {/* How we can help */}
                    <td className="bg-[color:color-mix(in_srgb,var(--mh-fg)_2%,transparent)] px-3.5 py-3 text-[var(--mh-fg)]">
                      <p className="line-clamp-2 max-w-[250px] leading-relaxed" title={howWeHelp}>
                        {howWeHelp}
                      </p>
                    </td>

                    {/* Scoring */}
                    <td className="whitespace-nowrap bg-[color:color-mix(in_srgb,var(--mh-fg)_2%,transparent)] px-3.5 py-3 text-right">
                      <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium', badge.cls)}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="p-12 text-center text-sm text-[var(--mh-muted)]">
            No leads match this filter.
          </div>
        )}
      </div>
    </div>
  )
}
