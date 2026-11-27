import { z } from 'zod'
import { createVertexClient, generateGeminiContent, getVertexModel, isVertexConfigured } from '@/lib/ai/vertex'
import type { BusinessProfile, RawPost } from '@/lib/types'

export const SIGNAL_TYPES = [
  'buying',
  'recommendation',
  'comparison',
  'pain',
  'competitor_churn',
  'hiring',
  'funding',
  'new_company',
  'other',
] as const
export type SignalType = (typeof SIGNAL_TYPES)[number]

export type ScoredSignal = {
  post: RawPost
  score: number
  icpFit: number
  type: SignalType
  reason: string
  outreachAngle: string
}

const resultSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int(),
      score: z.number().min(0).max(100),
      icp_fit: z.number().min(0).max(100).optional(),
      type: z.string().optional(),
      reason: z.string().optional(),
      angle: z.string().optional(),
    }),
  ),
})

const BATCH = 12

function normType(value: string | undefined): SignalType {
  const v = (value ?? '').toLowerCase().replace(/[-\s]/g, '_')
  return (SIGNAL_TYPES as readonly string[]).includes(v) ? (v as SignalType) : 'other'
}

async function scoreBatch(client: ReturnType<typeof createVertexClient>, profile: BusinessProfile, batch: RawPost[]) {
  const list = batch
    .map(
      (p, i) =>
        `[${i}] (${p.source}${p.community ? ` · ${p.community}` : ''}) ${p.title ? `${p.title} — ` : ''}${p.text.slice(0, 800)}`,
    )
    .join('\n\n')

  const instructions = `You find B2B buying-intent signals in public posts for this business.
Business: ${profile.companyName} — ${profile.oneLiner}
Category: ${profile.category}
ICP: ${profile.icp.summary}
Target roles: ${profile.icp.buyerPersonas.join(', ')}
Pain points it solves: ${profile.icp.painPoints.join('; ')}
Buying triggers: ${(profile.icp.buyingTriggers ?? []).join('; ')}
Competitors: ${profile.competitors.join(', ')}

For each post decide:
- type: buying (asks for a tool/vendor/agency), recommendation (asks what others use), comparison (weighs options), pain (describes a problem this product solves), competitor_churn (unhappy with or leaving a competitor), hiring (hiring for the function this product replaces), funding, other.
- score 0-100 = how likely the AUTHOR is a real buyer with a live need right now. 80+ means an explicit request or switch. 50-79 means a clear related pain. Under 40 means weak, a vendor promoting itself, a tutorial, news with no need, or spam.
- icp_fit 0-100 = how well the author or company matches the ICP (use 50 when unknown).
- reason: under 14 words, why this is a signal.
- angle: under 18 words, the personalised first line a salesperson could open with, referring to what the person actually said.
Skip anything under 30. Return JSON: {"results":[{"index":number,"score":number,"icp_fit":number,"type":string,"reason":string,"angle":string}]}`

  const response = await generateGeminiContent(client, {
    model: getVertexModel(),
    contents: `Score these posts.\n\n${list}`,
    config: {
      systemInstruction: instructions,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
      temperature: 0.1,
    },
  })
  if (!response.text) throw new Error('Empty scoring response')
  return resultSchema.parse(JSON.parse(response.text)).results
}

/**
 * Scores posts for buying intent. A batch that fails is retried once; if it still fails those posts are
 * returned in `failed` (never silently given a score of 0) so the caller can report it.
 */
export async function scoreSignals(
  profile: BusinessProfile,
  posts: RawPost[],
): Promise<{ scored: ScoredSignal[]; failed: number }> {
  if (!posts.length) return { scored: [], failed: 0 }
  if (!isVertexConfigured()) throw new Error('AI scoring is not configured on this server.')
  const client = createVertexClient()

  const batches: RawPost[][] = []
  for (let i = 0; i < posts.length; i += BATCH) batches.push(posts.slice(i, i + BATCH))

  let failed = 0
  const scored: ScoredSignal[] = []
  await Promise.all(
    batches.map(async (batch) => {
      let results: Awaited<ReturnType<typeof scoreBatch>> | null = null
      for (let attempt = 0; attempt < 2 && !results; attempt += 1) {
        try {
          results = await scoreBatch(client, profile, batch)
        } catch (error) {
          if (attempt === 1) console.warn('[listening/score] batch failed', error instanceof Error ? error.message : error)
        }
      }
      if (!results) {
        failed += batch.length
        return
      }
      for (const r of results) {
        const post = batch[r.index]
        if (!post) continue
        scored.push({
          post,
          score: Math.round(r.score),
          icpFit: Math.round(r.icp_fit ?? 50),
          type: normType(r.type),
          reason: (r.reason ?? '').trim(),
          outreachAngle: (r.angle ?? '').trim(),
        })
      }
    }),
  )
  return { scored, failed }
}
