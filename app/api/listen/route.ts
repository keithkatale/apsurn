import { z } from 'zod'
import { scorePosts } from '@/lib/ai'
import { runListening } from '@/lib/sources'
import { businessProfileSchema, type ListenResponse, type SourceId } from '@/lib/types'

export const maxDuration = 120

const sourceIds = ['reddit', 'hackernews', 'bluesky', 'stackexchange', 'lemmy', 'mastodon', 'github'] as const satisfies SourceId[]

const bodySchema = z.object({
  profile: businessProfileSchema,
  keywords: z.array(z.string().trim().min(2).max(80)).min(1).max(12),
  hashtags: z.array(z.string().trim().max(40)).max(5).default([]),
  sources: z.array(z.enum(sourceIds)).min(1).default([...sourceIds]),
})

const MAX_SCORED = 120

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid listening request' }, { status: 400 })
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
