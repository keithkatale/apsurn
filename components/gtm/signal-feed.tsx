'use client'

import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { sourceLabel } from '@/lib/source-meta'
import type { ListenResponse, SourceId } from '@/lib/types'
import { cn } from '@/lib/utils'
import { scoreTier, SignalCard } from './signal-card'

const TIERS = [
  { id: 'hot', label: 'Hot (75+)' },
  { id: 'warm', label: 'Warm+ (45+)' },
  { id: 'all', label: 'All' },
] as const

function toCsv(data: ListenResponse['posts']) {
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const header = ['score', 'intent', 'source', 'community', 'author', 'created_at', 'title', 'text', 'url', 'reason', 'outreach_angle']
  const rows = data.map((p) =>
    [p.score, p.intent, p.source, p.community, p.author, p.createdAt, p.title, p.text, p.url, p.reason, p.outreachAngle].map(escape).join(','),
  )
  return [header.join(','), ...rows].join('\n')
}

export function SignalFeedSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading signals">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-4 rounded-xl border bg-card p-5">
          <Skeleton className="size-12 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SignalFeed({ data }: { data: ListenResponse }) {
  const [tier, setTier] = useState<(typeof TIERS)[number]['id']>('warm')
  const [source, setSource] = useState<SourceId | 'all'>('all')

  const filtered = useMemo(
    () =>
      data.posts.filter((p) => {
        if (source !== 'all' && p.source !== source) return false
        const t = scoreTier(p.score)
        if (tier === 'hot') return t === 'hot'
        if (tier === 'warm') return t !== 'cold'
        return true
      }),
    [data.posts, tier, source],
  )

  const hotCount = data.posts.filter((p) => p.score >= 75).length

  const download = () => {
    const blob = new Blob([toCsv(filtered)], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `intent-signals-${data.scannedAt.slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section aria-labelledby="signals-heading" className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Posts scanned (7d)" value={data.totalScanned} />
        <Stat label="Scored by AI" value={data.posts.length} />
        <Stat label="Hot signals" value={hotCount} highlight />
      </div>

      <div className="flex flex-wrap gap-1.5" aria-label="Source status">
        {data.sources.map((s) => (
          <span
            key={s.source}
            title={s.error}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px]',
              s.ok ? 'text-foreground' : 'text-muted-foreground line-through decoration-destructive/60',
            )}
          >
            <span className={cn('size-1.5 rounded-full', s.ok ? 'bg-signal' : 'bg-destructive')} aria-hidden />
            {sourceLabel(s.source)} {s.ok ? s.count : `· ${s.error ?? 'failed'}`}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="signals-heading" className="text-lg font-semibold tracking-tight">
          Intent signals <span className="font-mono text-sm font-normal text-muted-foreground">({filtered.length})</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="Filter by intent score">
            {TIERS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tier === t.id}
                onClick={() => setTier(t.id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs transition-colors',
                  tier === t.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label htmlFor="source-filter" className="sr-only">
            Filter by source
          </label>
          <select
            id="source-filter"
            value={source}
            onChange={(e) => setSource(e.target.value as SourceId | 'all')}
            className="h-8 rounded-lg border bg-card px-2 text-xs"
          >
            <option value="all">All sources</option>
            {data.sources
              .filter((s) => s.ok)
              .map((s) => (
                <option key={s.source} value={s.source}>
                  {sourceLabel(s.source)}
                </option>
              ))}
          </select>
          <Button variant="outline" size="sm" className="h-8" onClick={download} disabled={!filtered.length}>
            <Download aria-hidden />
            CSV
          </Button>
        </div>
      </div>

      {filtered.length ? (
        <div className="flex flex-col gap-3">
          {filtered.map((post) => (
            <SignalCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm leading-relaxed text-muted-foreground">
          No posts match this filter. Try &quot;All&quot;, broaden your keywords, or add more phrasing variations.
        </div>
      )}
    </section>
  )
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-4">
      <span className={cn('font-mono text-2xl font-semibold', highlight && 'text-signal')}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
