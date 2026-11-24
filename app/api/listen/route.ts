import { z } from 'zod'
import { scorePosts } from '@/lib/ai'
import { runListening } from '@/lib/sources'
import { businessProfileSchema, SENIORITY_OPTIONS, type ListenResponse, type SeniorityId, type SourceId } from '@/lib/types'

export const maxDuration = 120

const sourceIds = ['apify', 'reddit', 'hackernews', 'bluesky', 'stackexchange', 'lemmy', 'mastodon', 'github'] as const satisfies SourceId[]
const seniorityIds = SENIORITY_OPTIONS.map((s) => s.id) as [SeniorityId, ...SeniorityId[]]

const bodySchema = z.object({
  profile: businessProfileSchema,
  keywords: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  hashtags: z.array(z.string().trim().max(40)).max(5).default([]),
  sources: z.array(z.enum(sourceIds)).min(1).default(['apify']),
  personTitle: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  personCountry: z.array(z.string().trim().min(1).max(80)).max(10).default(['United States']),
  seniority: z.array(z.enum(seniorityIds)).default(['founder', 'c_suite', 'vp', 'head', 'director']),
  totalResults: z.number().int().min(100).max(1000).default(100),
  apifyToken: z.string().trim().optional(),
})

const MAX_SCORED = 80

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid lead generation request' }, { status: 400 })
  const { profile, keywords, hashtags, sources, personTitle, personCountry, seniority, totalResults, apifyToken } = parsed.data

  const { posts, sources: statuses } = await runListening(keywords, hashtags, sources, {
    personTitle: personTitle.length ? personTitle : profile.icp.buyerPersonas,
    webKeywords: keywords.length ? keywords : profile.icp.industries,
    personCountry: personCountry.length ? personCountry : profile.icp.geographies,
    seniority,
    totalResults,
    apifyToken,
  })

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
