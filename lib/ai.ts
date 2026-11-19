import { generateText, Output } from 'ai'
import { z } from 'zod'
import { businessProfileSchema, intentTypes, type BusinessProfile, type RawPost, type ScoredPost } from './types'

const MODEL = 'openai/gpt-5.4-mini'

export async function analyzeBusiness(input: {
  url: string
  meta: { title: string; description: string }
  pages: { url: string; text: string }[]
}): Promise<BusinessProfile> {
  const corpus = input.pages.map((p) => `### PAGE: ${p.url}\n${p.text}`).join('\n\n')

  const { output } = await generateText({
    model: MODEL,
    instructions:
      'You are a senior go-to-market strategist. From raw website copy, infer a precise business profile, ICP, and the exact phrases real prospects write online when they are actively looking for a solution like this. Be specific and concrete; avoid generic marketing filler. If something is not stated, infer the most likely answer from context.',
    output: Output.object({ schema: businessProfileSchema }),
    prompt: `Website: ${input.url}\nTitle: ${input.meta.title}\nMeta description: ${input.meta.description}\n\n${corpus}`,
  })
  return output
}

const scoreSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int(),
      score: z.number().int().min(0).max(100).describe('Likelihood this author is a potential customer with intent now'),
      intent: z.enum(intentTypes),
      reason: z.string().describe('One short sentence why'),
      outreachAngle: z.string().describe('One short sentence on how to helpfully engage (not spammy)'),
    }),
  ),
})

async function scoreBatch(profile: BusinessProfile, batch: RawPost[]) {
  const list = batch
    .map((p, i) => `[${i}] (${p.source}${p.community ? ` · ${p.community}` : ''}) ${p.title ? `${p.title} — ` : ''}${p.text.slice(0, 450)}`)
    .join('\n\n')

  const { output } = await generateText({
    model: MODEL,
    instructions: `You qualify social posts as sales leads for this business.
Business: ${profile.companyName} — ${profile.oneLiner}
Category: ${profile.category}
ICP: ${profile.icp.summary}
Pain points: ${profile.icp.painPoints.join('; ')}
Competitors: ${profile.competitors.join(', ')}

Scoring: 80-100 = explicitly asking for a tool/vendor/recommendation or switching away from a competitor; 50-79 = clearly describes a pain this product solves; 20-49 = loosely related discussion; 0-19 = irrelevant, news, spam, or the author is a vendor promoting their own product.
Intent labels: buying, recommendation (asking for suggestions), comparison (evaluating options), pain (venting about the problem), competitor-churn (unhappy with a competitor), other.`,
    output: Output.object({ schema: scoreSchema }),
    prompt: `Score every post. Return one result per index.\n\n${list}`,
  })

  return batch.map((post, i): ScoredPost => {
    const r = output.results.find((x) => x.index === i)
    return {
      ...post,
      score: r?.score ?? 0,
      intent: r?.intent ?? 'other',
      reason: r?.reason ?? '',
      outreachAngle: r?.outreachAngle ?? '',
    }
  })
}

export async function scorePosts(profile: BusinessProfile, posts: RawPost[]) {
  const BATCH = 30
  const batches: RawPost[][] = []
  for (let i = 0; i < posts.length; i += BATCH) batches.push(posts.slice(i, i + BATCH))
  const results = await Promise.allSettled(batches.map((b) => scoreBatch(profile, b)))
  return results.flatMap((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : batches[i].map((p): ScoredPost => ({ ...p, score: 0, intent: 'other', reason: 'Scoring unavailable', outreachAngle: '' })),
  )
}
