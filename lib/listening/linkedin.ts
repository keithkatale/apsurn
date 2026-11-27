import { getConfiguredApifyTokens } from '@/lib/apify-leads'
import type { RawPost } from '@/lib/types'

// LinkedIn posts through Apify's harvestapi/linkedin-post-search (no login or cookies needed, pay per result).
// LinkedIn's terms restrict scraping, so this is gated to paid workspaces and kept small and company-focused.
const ACTOR = (process.env.APIFY_LINKEDIN_POSTS_ACTOR?.trim() || 'harvestapi/linkedin-post-search').replace('/', '~')
const POSTS_PER_QUERY = 10
export const LINKEDIN_MAX_QUERIES = 3
const TIMEOUT_S = 100

type LinkedInItem = {
  id?: string
  linkedinUrl?: string
  content?: string
  author?: { name?: string; info?: string; type?: string; linkedinUrl?: string }
  postedAt?: { timestamp?: number; date?: string }
  engagement?: { likes?: number; comments?: number; shares?: number } | null
  query?: string
}

const clean = (text: string) => text.replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim().slice(0, 1200)

export async function fetchLinkedInPosts(queries: string[], since: Date): Promise<RawPost[]> {
  const searchQueries = [...new Set(queries.map((q) => q.trim()).filter(Boolean))].slice(0, LINKEDIN_MAX_QUERIES)
  if (!searchQueries.length) return []
  const tokens = getConfiguredApifyTokens()
  if (!tokens.length) throw new Error('Needs an Apify token (APIFY_API_TOKEN)')

  const postedLimit = Date.now() - since.getTime() <= 8 * 24 * 60 * 60 * 1000 ? 'week' : 'month'
  let lastError = 'LinkedIn search failed'
  for (const token of tokens) {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${TIMEOUT_S}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchQueries, maxPosts: POSTS_PER_QUERY, postedLimit, sortBy: 'date' }),
        signal: AbortSignal.timeout((TIMEOUT_S + 10) * 1000),
        cache: 'no-store',
      },
    )
    if (res.status === 401 || res.status === 402 || res.status === 403) {
      lastError = res.status === 402 ? 'Apify credits are used up' : `Apify rejected the request (HTTP ${res.status})`
      continue
    }
    if (!res.ok) throw new Error(`LinkedIn search failed (HTTP ${res.status})`)
    const items = (await res.json()) as LinkedInItem[]
    if (!Array.isArray(items)) return []

    const posts: RawPost[] = []
    for (const item of items) {
      const text = clean(item.content ?? '')
      if (!item.id || !item.linkedinUrl || text.length <= 20) continue
      const ts = item.postedAt?.timestamp ?? (item.postedAt?.date ? Date.parse(item.postedAt.date) : NaN)
      if (!Number.isFinite(ts) || ts < since.getTime()) continue
      const e = item.engagement
      posts.push({
        id: `li-${item.id}`,
        source: 'linkedin',
        url: item.linkedinUrl,
        title: null,
        text,
        author: item.author?.name ?? null,
        // The author's headline (role and company) is the most useful hint for who this person is.
        community: item.author?.info?.slice(0, 160) ?? null,
        createdAt: new Date(ts).toISOString(),
        keyword: item.query ?? searchQueries[0],
        engagement: e ? (e.likes ?? 0) + (e.comments ?? 0) + (e.shares ?? 0) : null,
      })
    }
    return posts
  }
  throw new Error(lastError)
}
