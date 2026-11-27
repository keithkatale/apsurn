import { z } from 'zod'
import { scorePosts } from '@/lib/ai'
import { getCurrentUserId } from '@/lib/auth/session'
import { rateLimit } from '@/lib/rate-limit'
import { runListening } from '@/lib/sources'
import { businessProfileSchema, SENIORITY_OPTIONS, type ListenResponse, type SeniorityId, type SourceId } from '@/lib/types'

export const maxDuration = 120

const sourceIds = ['apify', 'hackernews', 'bluesky', 'stackexchange', 'lemmy', 'mastodon', 'github'] as const satisfies SourceId[]
const seniorityIds = SENIORITY_OPTIONS.map((s) => s.id) as [SeniorityId, ...SeniorityId[]]

const bodySchema = z.object({
  profile: businessProfileSchema,
  keywords: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  hashtags: z.array(z.string().trim().max(40)).max(5).default([]),
  // Apify is not available here: it spends the server's Apify budget. Use /api/setup/leads or /api/listening.
  sources: z.array(z.enum(sourceIds).exclude(['apify'])).min(1).default(['hackernews']),
})

const MAX_SCORED = 60

/** Legacy stateless listener, kept for the old UI components. Now requires sign-in and never runs Apify. */
export async function POST(req: Request) {
  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    return Response.json({ error: 'Sign in to continue.' }, { status: 401 })
  }
  if (!rateLimit(`listen:${userId}`, 10, 10 * 60 * 1000)) {
    return Response.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 })
  const { profile, keywords, hashtags, sources } = parsed.data

  const { posts, sources: statuses } = await runListening(keywords, hashtags, sources)

  const newestFirst = posts.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, MAX_SCORED)
  const scored = newestFirst.length ? await scorePosts(profile, newestFirst) : []

  const body: ListenResponse = {
    posts: scored.sort((a, b) => b.score - a.score || +new Date(b.createdAt) - +new Date(a.createdAt)),
    sources: statuses,
    scannedAt: new Date().toISOString(),
    totalScanned: posts.length,
  }
  return Response.json(body)
}
