'use client'

import { ArrowUpRight, Bookmark, Check, ExternalLink, Loader2, Plus, Radio, Sparkles, UserPlus, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { SourceIcon, sourceLabel } from '@/components/listening/SourceIcon'
import { cn } from '@/lib/utils'

type Signal = {
  id: string
  source: string
  url: string
  author: string | null
  author_headline: string | null
  community: string | null
  title: string | null
  text: string
  posted_at: string | null
  signal_type: string
  score: number
  icp_fit: number
  reason: string | null
  outreach_angle: string | null
  status: 'new' | 'saved' | 'dismissed' | 'lead'
  matched_query: string | null
}

type Watch = { id: string; kind: string; query: string; active: boolean; last_scanned_at: string | null }

type Feed = {
  hasProfile: boolean
  watchesFromBlueprintOnly?: boolean
  migrationRequired?: boolean
  watches: Watch[]
  signals: Signal[]
  lastRun: { status: string; items_found: number; items_kept: number; credits_charged: number; error: string | null } | null
  billing: { active: boolean; credits: number; scanCost: number; signalCost: number; freeCap: number }
}

const TYPE_LABELS: Record<string, string> = {
  buying: 'Looking to buy',
  recommendation: 'Asking for recs',
  comparison: 'Comparing options',
  pain: 'Has the pain',
  competitor_churn: 'Leaving a competitor',
  hiring: 'Hiring for it',
  funding: 'Just funded',
  new_company: 'New company',
  other: 'Other',
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`
  return `${Math.round(mins / 60 / 24)}d ago`
}

const chip =
  'inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--mh-soft)] px-3 text-xs font-medium transition-colors'

export default function SignalsPage() {
  const [feed, setFeed] = useState<Feed | null>(null)
  const [loading, setLoading] = useState(true)
  const [signedOut, setSignedOut] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [newQuery, setNewQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/listening')
    if (res.status === 401) {
      setSignedOut(true)
      setLoading(false)
      return
    }
    if (res.ok) setFeed((await res.json()) as Feed)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const scan = async () => {
    setScanning(true)
    setBanner(null)
    try {
      const res = await fetch('/api/listening/scan', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setBanner(data?.error ?? 'The scan failed. Please try again.')
        return
      }
      const s = data.summary as {
        kept: number
        newPosts: number
        capped: boolean
        credits: number
        failedScoring: number
        sources: { source: string; ok: boolean; count: number; error?: string }[]
      }
      const parts = [
        s.kept > 0
          ? `Found ${s.kept} new signal${s.kept === 1 ? '' : 's'} from ${s.newPosts} new post${s.newPosts === 1 ? '' : 's'}.`
          : `Checked ${s.newPosts} new post${s.newPosts === 1 ? '' : 's'}, none looked like buying intent yet.`,
      ]
      const down = s.sources.filter((x) => !x.ok)
      if (down.length) {
        parts.push(`Could not reach ${down.map((x) => `${sourceLabel(x.source)}${x.error ? ` (${x.error})` : ''}`).join(', ')}.`)
      }
      if (s.credits) parts.push(`${s.credits} credits used.`)
      if (s.capped) parts.push(feed?.billing.active ? 'Some results were held back to fit your credits.' : 'Upgrade to see everything we find.')
      if (s.failedScoring) parts.push(`${s.failedScoring} posts could not be scored and will be retried next scan.`)
      setBanner(parts.join(' '))
      await load()
    } finally {
      setScanning(false)
    }
  }

  const act = async (id: string, action: 'save' | 'dismiss' | 'restore' | 'to_lead') => {
    setBusyId(id)
    try {
      const res = await fetch('/api/listening/signals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setBanner(data?.error ?? 'Could not update that signal.')
        return
      }
      setFeed((f) =>
        f
          ? {
              ...f,
              signals:
                data.status === 'dismissed'
                  ? f.signals.filter((s) => s.id !== id)
                  : f.signals.map((s) => (s.id === id ? { ...s, status: data.status } : s)),
            }
          : f,
      )
      if (action === 'to_lead') setBanner('Added to your Leads, in the "Signals" table.')
    } finally {
      setBusyId(null)
    }
  }

  const addWatch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newQuery.trim()) return
    const res = await fetch('/api/listening/watches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'keyword', query: newQuery.trim() }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return setBanner(data?.error ?? 'Could not add that.')
    setNewQuery('')
    await load()
  }

  const toggleWatch = async (w: Watch) => {
    if (w.id.startsWith('blueprint-')) return

    setFeed((f) => (f ? { ...f, watches: f.watches.map((x) => (x.id === w.id ? { ...x, active: !w.active } : x)) } : f))
    await fetch('/api/listening/watches', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: w.id, active: !w.active }),
    })
  }

  const removeWatch = async (w: Watch) => {
    if (w.id.startsWith('blueprint-')) return

    setFeed((f) => (f ? { ...f, watches: f.watches.filter((x) => x.id !== w.id) } : f))
    await fetch('/api/listening/watches', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: w.id }),
    })
  }

  const types = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of feed?.signals ?? []) counts.set(s.signal_type, (counts.get(s.signal_type) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [feed])

  const visible = (feed?.signals ?? []).filter((s) => typeFilter === 'all' || s.signal_type === typeFilter)

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-normal text-[var(--mh-fg)]">Signals</h1>
            {feed && (
              <span className="rounded-full bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] px-2.5 py-0.5 font-mono text-[11px] font-medium text-[var(--mh-muted)]">
                {feed.signals.length} buying signals
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void scan()}
            disabled={scanning || !feed?.hasProfile}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-3.5 text-xs font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {scanning ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Radio className="size-3.5" aria-hidden />}
            <span>{scanning ? 'Listening…' : 'Scan now'}</span>
          </button>
        </div>

        {banner && (
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)] px-4 py-2 text-xs text-[var(--mh-fg)]">
            <span className="flex items-center gap-2">
              <Sparkles className="size-3.5 shrink-0" />
              <span>{banner}</span>
            </span>
            <button type="button" onClick={() => setBanner(null)} className="text-[var(--mh-muted)] hover:text-[var(--mh-fg)]">
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {feed?.migrationRequired && (
          <div className="rounded-[10px] border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-[var(--mh-fg)]">
            Signals storage is not set up on the database yet. Run <code>supabase/migrations/0005_listening.sql</code> in the
            Supabase SQL editor, then reload this page.
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 animate-spin text-[var(--mh-fg)]" />
          </div>
        ) : signedOut ? (
          <div className="rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-8 text-center text-sm text-[var(--mh-fg)]">
            <Link href="/login?next=/signals" className="font-medium underline">
              Sign in
            </Link>{' '}
            to see who is looking for what you sell.
          </div>
        ) : !feed?.hasProfile ? (
          <div className="rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-8 text-center text-sm text-[var(--mh-fg)]">
            Finish setup so we know what to listen for.{' '}
            <Link href="/setup" className="font-medium underline">
              Go to setup
            </Link>
          </div>
        ) : (
          <>
            <section className="project-card rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--mh-muted)]">What we listen for</h2>
                <p className="text-[11px] text-[var(--mh-muted)]">
                  {feed.billing.active
                    ? `${feed.billing.credits} credits. A scan costs ${feed.billing.scanCost}, plus ${feed.billing.signalCost} per signal found.`
                    : `Free preview shows up to ${feed.billing.freeCap} signals per scan. Unlock credits to see everything.`}
                </p>
              </div>
              <p className="mt-1 text-[11px] text-[var(--mh-muted)]">
                {feed.watchesFromBlueprintOnly
                  ? 'Taken from your business blueprint. They will be saved the first time you scan.'
                  : 'Started from your business blueprint. Click a tag to pause it, or add your own.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {feed.watches.map((w) => (
                  <span
                    key={w.id}
                    className={cn(chip, w.active ? 'text-[var(--mh-fg)]' : 'text-[var(--mh-muted)] line-through opacity-70')}
                  >
                    <button type="button" onClick={() => void toggleWatch(w)} title={w.active ? 'Pause' : 'Resume'}>
                      {w.kind === 'competitor' ? `vs ${w.query}` : w.query}
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeWatch(w)}
                      aria-label={`Remove ${w.query}`}
                      className="text-[var(--mh-muted)] hover:text-red-500"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <form onSubmit={addWatch} className="flex items-center gap-1.5">
                  <input
                    value={newQuery}
                    onChange={(e) => setNewQuery(e.target.value)}
                    placeholder="Add a phrase, e.g. looking for a CRM"
                    className="h-7 w-64 rounded-full border border-[var(--mh-soft)] bg-transparent px-3 text-xs text-[var(--mh-fg)] outline-none focus:border-[var(--mh-fg)]"
                  />
                  <button type="submit" aria-label="Add" className={cn(chip, 'text-[var(--mh-fg)] hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)]')}>
                    <Plus className="size-3" />
                  </button>
                </form>
              </div>
            </section>

            {types.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTypeFilter('all')}
                  className={cn(chip, typeFilter === 'all' ? 'bg-[var(--mh-fg)] text-[var(--mh-bg)]' : 'text-[var(--mh-fg)]')}
                >
                  All
                </button>
                {types.map(([type, n]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTypeFilter(type)}
                    className={cn(chip, typeFilter === type ? 'bg-[var(--mh-fg)] text-[var(--mh-bg)]' : 'text-[var(--mh-fg)]')}
                  >
                    {TYPE_LABELS[type] ?? type} · {n}
                  </button>
                ))}
              </div>
            )}

            {visible.length === 0 ? (
              <div className="rounded-[10px] border border-dashed border-[var(--mh-soft)] p-10 text-center text-sm text-[var(--mh-muted)]">
                No signals yet. Press <span className="font-medium text-[var(--mh-fg)]">Scan now</span> to look across LinkedIn,
                Hacker News, Bluesky, Stack Exchange, Lemmy and GitHub.
                <span className="mt-3 flex items-center justify-center gap-3">
                  {['linkedin', 'hackernews', 'bluesky', 'stackexchange', 'lemmy', 'github'].map((id) => (
                    <SourceIcon key={id} source={id} className="size-5" />
                  ))}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {visible.map((s) => (
                  <article key={s.id} className="project-card rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-4">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--mh-muted)]">
                      <span className="rounded-full bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] px-2 py-0.5 font-medium text-[var(--mh-fg)]">
                        {TYPE_LABELS[s.signal_type] ?? s.signal_type}
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-[var(--mh-fg)]">
                        <SourceIcon source={s.source} className="size-3.5" />
                        {sourceLabel(s.source)}
                      </span>
                      {s.community && <span>· {s.community}</span>}
                      {s.author && <span>· {s.author}</span>}
                      {s.author_headline && <span className="max-w-[28ch] truncate">· {s.author_headline}</span>}
                      <span>· {ago(s.posted_at)}</span>
                      <span className="ml-auto font-mono font-medium text-[var(--mh-fg)]">{s.score}</span>
                    </div>
                    {s.title && <h3 className="mt-2 text-sm font-medium text-[var(--mh-fg)]">{s.title}</h3>}
                    <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-[var(--mh-muted)]">{s.text}</p>
                    {(s.reason || s.outreach_angle) && (
                      <div className="mt-3 rounded-[8px] bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] p-3 text-xs leading-relaxed text-[var(--mh-fg)]">
                        {s.reason && <p>{s.reason}</p>}
                        {s.outreach_angle && (
                          <p className="mt-1 text-[var(--mh-muted)]">
                            <span className="font-medium text-[var(--mh-fg)]">Open with: </span>
                            {s.outreach_angle}
                          </p>
                        )}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(chip, 'text-[var(--mh-fg)] hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)]')}
                      >
                        <ExternalLink className="size-3" /> Open post
                      </a>
                      {s.status === 'lead' ? (
                        <Link href="/leads" className={cn(chip, 'text-[var(--mh-fg)]')}>
                          <Check className="size-3" /> In Leads <ArrowUpRight className="size-3" />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === s.id}
                          onClick={() => void act(s.id, 'to_lead')}
                          className={cn(chip, 'bg-[var(--mh-fg)] text-[var(--mh-bg)] hover:opacity-90 disabled:opacity-50')}
                        >
                          {busyId === s.id ? <Loader2 className="size-3 animate-spin" /> : <UserPlus className="size-3" />} Add to leads
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void act(s.id, s.status === 'saved' ? 'restore' : 'save')}
                        className={cn(chip, 'text-[var(--mh-fg)] hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)]')}
                      >
                        <Bookmark className={cn('size-3', s.status === 'saved' && 'fill-current')} /> {s.status === 'saved' ? 'Saved' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void act(s.id, 'dismiss')}
                        className={cn(chip, 'text-[var(--mh-muted)] hover:text-[var(--mh-fg)]')}
                      >
                        Dismiss
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardShell>
  )
}
