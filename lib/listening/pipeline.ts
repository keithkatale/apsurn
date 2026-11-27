import { creditCost, getBillingState, spendCredits } from '@/lib/billing/credits'
import { createAdminClient } from '@/lib/supabase/admin'
import { FREE_SOURCE_IDS, fetchKeywordPosts, freeSourceLimit, type FreeSourceId } from '@/lib/sources'
import type { BusinessProfile, RawPost } from '@/lib/types'
import { fetchLinkedInPosts } from './linkedin'
import { scoreSignals } from './score'

export type Watch = {
  id: string
  kind: string
  query: string
  sources: string[]
  active: boolean
  last_scanned_at: string | null
}

export type ScanSummary = {
  runId: string | null
  scanned: number
  newPosts: number
  kept: number
  failedScoring: number
  credits: number
  capped: boolean
  sources: { source: string; ok: boolean; count: number; error?: string }[]
}

/** Score at or above this becomes a stored signal. */
export const KEEP_SCORE = 45
/** Unpaid workspaces see a small preview and are never charged. */
export const FREE_SIGNAL_CAP = 10
const MAX_SCORED_PAID = 72
const MAX_SCORED_FREE = 24
const FIRST_SCAN_DAYS = 7

const isFree = (s: string): s is FreeSourceId => (FREE_SOURCE_IDS as readonly string[]).includes(s)

/** Competitor watches search the phrases people use when they are shopping around or leaving. */
export function expandQueries(watch: Watch): string[] {
  const q = watch.query.trim()
  if (!q) return []
  if (watch.kind === 'competitor') return [`alternative to ${q}`, `switching from ${q}`]
  return [q]
}

export async function runScan(opts: {
  userId: string
  companyId: string | null
  profile: BusinessProfile
  watches: Watch[]
}): Promise<ScanSummary> {
  const { userId, companyId, profile } = opts
  const supabase = createAdminClient()
  const watches = opts.watches.filter((w) => w.active)

  const billing = await getBillingState(userId).catch(() => null)
  const paid = Boolean(billing?.active && billing.credits >= creditCost('lead_source_scan'))
  const scanCost = creditCost('lead_source_scan')
  const keepCost = creditCost('signal_kept')

  const { data: run } = await supabase
    .from('scan_runs')
    .insert({ user_id: userId, source: 'free_sources', status: 'running' })
    .select('id')
    .single()
  const runId: string | null = run?.id ?? null

  const defaultSince = new Date(Date.now() - FIRST_SCAN_DAYS * 24 * 60 * 60 * 1000)
  const jobs: { source: FreeSourceId; query: string; since: Date }[] = []
  const perSourceCount = new Map<string, number>()
  for (const watch of watches) {
    const since = watch.last_scanned_at ? new Date(Math.max(+new Date(watch.last_scanned_at), +defaultSince)) : defaultSince
    for (const source of watch.sources.filter(isFree)) {
      for (const query of expandQueries(watch)) {
        const n = perSourceCount.get(source) ?? 0
        if (n >= freeSourceLimit(source)) continue
        perSourceCount.set(source, n + 1)
        jobs.push({ source, query, since })
      }
    }
  }

  // LinkedIn is a paid Apify run, so only workspaces with credits get it. Competitor phrases go first.
  const linkedinQueries = [...watches]
    .sort((a, b) => Number(b.kind === 'competitor') - Number(a.kind === 'competitor'))
    .flatMap(expandQueries)
    .filter((q) => q.length <= 80)
  const linkedinCost = creditCost('linkedin_scan')
  const linkedinOn = paid && linkedinQueries.length > 0 && (billing?.credits ?? 0) >= scanCost + linkedinCost
  const linkedinSince = jobs.length ? new Date(Math.min(...jobs.map((j) => +j.since))) : defaultSince

  const [settled, linkedinResult] = await Promise.all([
    Promise.allSettled(jobs.map((j) => fetchKeywordPosts(j.source, j.query, j.since))),
    linkedinOn
      ? fetchLinkedInPosts(linkedinQueries, linkedinSince).then(
          (value) => ({ ok: true as const, value }),
          (error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : 'LinkedIn failed' }),
        )
      : Promise.resolve(null),
  ])
  const statusMap = new Map<string, { ok: number; count: number; error?: string }>()
  const posts: RawPost[] = []
  let linkedinCharged = 0
  if (linkedinResult?.ok) {
    statusMap.set('linkedin', { ok: 1, count: linkedinResult.value.length })
    posts.push(...linkedinResult.value)
    linkedinCharged = linkedinCost
  } else if (linkedinResult) {
    statusMap.set('linkedin', { ok: 0, count: 0, error: linkedinResult.error })
  } else {
    statusMap.set('linkedin', {
      ok: 0,
      count: 0,
      error: paid ? 'Not enough credits for LinkedIn' : 'Included once you have credits',
    })
  }
  settled.forEach((result, i) => {
    const { source } = jobs[i]
    const entry = statusMap.get(source) ?? { ok: 0, count: 0 }
    if (result.status === 'fulfilled') {
      entry.ok += 1
      entry.count += result.value.length
      posts.push(...result.value)
    } else {
      entry.error = result.reason instanceof Error ? result.reason.message : 'Request failed'
    }
    statusMap.set(source, entry)
  })

  // Dedupe within this scan, then drop anything we already stored for this user.
  const unique = new Map<string, RawPost>()
  for (const p of posts) if (!unique.has(p.id)) unique.set(p.id, p)
  const candidates = [...unique.values()]
  let fresh = candidates
  if (candidates.length) {
    const { data: existing } = await supabase
      .from('signals')
      .select('external_id')
      .eq('user_id', userId)
      .in('external_id', candidates.map((p) => p.id))
    const seen = new Set((existing ?? []).map((r) => r.external_id as string))
    fresh = candidates.filter((p) => !seen.has(p.id))
  }
  fresh.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  const toScore = fresh.slice(0, paid ? MAX_SCORED_PAID : MAX_SCORED_FREE)

  const summary: ScanSummary = {
    runId,
    scanned: candidates.length,
    newPosts: fresh.length,
    kept: 0,
    failedScoring: 0,
    credits: 0,
    capped: false,
    sources: [...statusMap.entries()].map(([source, s]) => ({
      source,
      ok: s.ok > 0,
      count: s.count,
      error: s.ok === 0 ? s.error : undefined,
    })),
  }

  try {
    const { scored, failed } = await scoreSignals(profile, toScore)
    summary.failedScoring = failed
    let keep = scored.filter((s) => s.score >= KEEP_SCORE).sort((a, b) => b.score - a.score)

    if (!paid) {
      if (keep.length > FREE_SIGNAL_CAP) summary.capped = true
      keep = keep.slice(0, FREE_SIGNAL_CAP)
    } else {
      // Never keep more than the balance can pay for after the scan fee.
      const budget = Math.max(
        0,
        Math.floor(((billing?.credits ?? 0) - scanCost - linkedinCharged) / Math.max(1, keepCost)),
      )
      if (keep.length > budget) {
        summary.capped = true
        keep = keep.slice(0, budget)
      }
    }

    if (keep.length) {
      const { error } = await supabase.from('signals').upsert(
        keep.map(({ post, score, icpFit, type, reason, outreachAngle }) => ({
          user_id: userId,
          company_id: companyId,
          source: post.source,
          external_id: post.id,
          url: post.url,
          author: post.author,
          author_headline: post.source === 'linkedin' ? post.community : null,
          community: post.source === 'linkedin' ? null : post.community,
          title: post.title,
          text: post.text.slice(0, 2000),
          posted_at: post.createdAt,
          matched_query: post.keyword,
          signal_type: type,
          score,
          icp_fit: icpFit,
          reason,
          outreach_angle: outreachAngle,
          scan_run_id: runId,
        })),
        { onConflict: 'user_id,source,external_id', ignoreDuplicates: true },
      )
      if (error) throw new Error(error.message)
    }
    summary.kept = keep.length

    if (paid) {
      const cost = scanCost + linkedinCharged + keep.length * keepCost
      const left = await spendCredits(userId, cost, 'lead_source_scan', runId ? `scan:${runId}` : undefined)
      summary.credits = left === null ? 0 : cost
    }

    const now = new Date().toISOString()
    if (watches.length) await supabase.from('listening_watches').update({ last_scanned_at: now }).in('id', watches.map((w) => w.id))
    if (runId) {
      await supabase
        .from('scan_runs')
        .update({
          status: 'done',
          items_found: candidates.length,
          items_kept: keep.length,
          credits_charged: summary.credits,
          finished_at: now,
        })
        .eq('id', runId)
    }
    return summary
  } catch (error) {
    if (runId) {
      await supabase
        .from('scan_runs')
        .update({
          status: 'failed',
          error: error instanceof Error ? error.message.slice(0, 300) : 'Scan failed',
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId)
    }
    throw error
  }
}
