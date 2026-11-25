import { generateText, Output } from 'ai'
import { z } from 'zod'
import { COLD_EMAIL_PLAYBOOK, formatEmailBody } from '@/lib/outreach/copywriting'
import {
  businessProfileSchema,
  campaignsSchema,
  competitorAnalysisSchema,
  intentTypes,
  type BusinessProfile,
  type CompetitorAnalysisResult,
  type GeneratedCampaign,
  type RawPost,
  type ScoredPost,
} from './types'
import { createVertexClient, getVertexModel, isVertexConfigured } from './ai/vertex'
import { createAnthropic } from '@ai-sdk/anthropic'
import type { GoogleGenAI } from '@google/genai'

const globalForVertex = globalThis as unknown as {
  __vertexClient?: GoogleGenAI
  __vertexWarmedUp?: boolean
}

function getVertexGenAI(): GoogleGenAI {
  if (!globalForVertex.__vertexClient) {
    globalForVertex.__vertexClient = createVertexClient()
  }
  if (!globalForVertex.__vertexWarmedUp) {
    globalForVertex.__vertexWarmedUp = true
    // Pre-warm ADC OAuth token and TLS keep-alive pool in the background
    globalForVertex.__vertexClient.models
      .generateContent({
        model: getVertexModel(),
        contents: 'ok',
        config: { maxOutputTokens: 1, thinkingConfig: { thinkingBudget: 0 } },
      })
      .catch(() => {})
  }
  return globalForVertex.__vertexClient
}

function shouldUseVertex(): boolean {
  const provider = process.env.AI_PROVIDER?.trim()?.toLowerCase() || 'anthropic'
  if (provider === 'vertex') {
    if (isVertexConfigured()) {
      return true
    }
    console.warn('[ai] Vertex AI is selected but not configured. Falling back to Anthropic.')
  }
  return false
}

// Eagerly warm up Vertex AI when the module loads on the server
if (shouldUseVertex()) {
  try {
    getVertexGenAI()
  } catch {
    // Ignore eager init errors
  }
}

function getSdkModel() {
  const provider = process.env.AI_PROVIDER?.trim()?.toLowerCase() || 'anthropic'

  if (provider === 'anthropic' || provider === 'vertex') {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
    if (!apiKey) {
      throw new Error('Neither Vertex AI nor Anthropic (ANTHROPIC_API_KEY) is configured.')
    }
    const model = process.env.ANTHROPIC_MODEL?.trim() || 'claude-3-haiku-20240307'
    console.log(`[ai] Using Anthropic with model: ${model}`)
    return createAnthropic({ apiKey })(model)
  }

  console.log(`[ai] Using OpenRouter with model: ${process.env.OPENROUTER_MODEL || 'anthropic/claude-3-haiku-20240307'}`)
  const model = process.env.OPENROUTER_MODEL?.trim() || 'anthropic/claude-3-haiku-20240307'
  return model
}

async function generateVertexJson<TSchema extends z.ZodType>(options: {
  schema: TSchema
  instructions: string
  prompt: string
}): Promise<z.infer<TSchema>> {
  const model = getVertexModel()
  const client = getVertexGenAI()
  const response = await client.models.generateContent({
    model,
    contents: options.prompt,
    config: {
      systemInstruction: options.instructions,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
      temperature: 0.1,
    },
  })
  if (!response.text) {
    throw new Error('Vertex AI returned an empty response.')
  }
  return options.schema.parse(JSON.parse(response.text))
}

const coreProfileSchema = businessProfileSchema.pick({
  companyName: true,
  oneLiner: true,
  category: true,
  businessModel: true,
  valueProposition: true,
  keyFeatures: true,
  competitors: true,
})

const icpSchema = businessProfileSchema.shape.icp

const keywordsAndTagsSchema = businessProfileSchema.pick({
  keywords: true,
  hashtags: true,
})

export async function analyzeBusiness(input: {
  url: string
  meta: { title: string; description: string }
  pages: { url: string; text: string }[]
}): Promise<BusinessProfile> {
  const corpus = input.pages.map((p) => `### PAGE: ${p.url}\n${p.text}`).join('\n\n')
  const baseContext = `Website: ${input.url}\nTitle: ${input.meta.title}\nMeta description: ${input.meta.description}\n\n${corpus}`

  if (shouldUseVertex()) {
    console.log(`[ai] Using Vertex AI (3-way parallel fast mode) with model: ${getVertexModel()}`)
    const instructions =
      'You are a senior GTM strategist. Infer precise, concrete details from the website copy. Keep every string concise (under 12 words). Return valid JSON matching the requested keys.'

    const [core, icp, listening] = await Promise.all([
      generateVertexJson({
        schema: coreProfileSchema,
        instructions,
        prompt: `${baseContext}\n\nReturn a JSON object with exact keys:
{
  "companyName": string,
  "oneLiner": string (1 concise sentence),
  "category": string (e.g. "B2B SaaS — CRM"),
  "businessModel": { "type": string, "revenueModel": string, "pricingSignals": string, "salesMotion": string },
  "valueProposition": string (1 concise sentence),
  "keyFeatures": string[] (4 short items),
  "competitors": string[] (4 competitor names)
}`,
      }),
      generateVertexJson({
        schema: icpSchema,
        instructions,
        prompt: `${baseContext}\n\nReturn a JSON object describing the Ideal Customer Profile with exact keys:
{
  "summary": string (1-2 concise sentences),
  "industries": string[] (3-4 items),
  "companySize": string,
  "geographies": string[] (2-3 items),
  "buyerPersonas": string[] (3-4 job titles),
  "painPoints": string[] (4 concrete problems, <10 words each),
  "buyingTriggers": string[] (3-4 trigger events, <10 words each)
}`,
      }),
      generateVertexJson({
        schema: keywordsAndTagsSchema,
        instructions,
        prompt: `${baseContext}\n\nReturn a JSON object with exact keys:
{
  "keywords": string[] (8 short 2-4 word forum search phrases showing buying intent, e.g. "alternative to <competitor>", "recommend <category>", pain phrases; no quotes/hashtags),
  "hashtags": string[] (4 single-word lowercase hashtags without #)
}`,
      }),
    ])

    return {
      ...core,
      icp,
      ...listening,
    }
  }

  const { output } = await generateText({
    model: getSdkModel(),
    instructions:
      'You are a senior go-to-market strategist. From raw website copy, infer a precise business profile, ICP, and the exact phrases real prospects write online when they are actively looking for a solution like this. Be specific and concrete; avoid generic marketing filler. If something is not stated, infer the most likely answer from context.',
    output: Output.object({ schema: businessProfileSchema }),
    prompt: baseContext,
  })
  return output as BusinessProfile
}

const scoreSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int(),
      score: z.number().int().min(0).max(100),
      intent: z.enum(intentTypes).catch('other'),
      reason: z.string().optional(),
      outreachAngle: z.string().optional(),
    }),
  ),
})

async function scoreBatch(profile: BusinessProfile, batch: RawPost[]) {
  const list = batch
    .map((p, i) => `[${i}] (${p.source}${p.community ? ` · ${p.community}` : ''}) ${p.title ? `${p.title} — ` : ''}${p.text.slice(0, 260)}`)
    .join('\n\n')

  const instructions = `You qualify B2B leads and social posts for this business.
Business: ${profile.companyName} — ${profile.oneLiner}
Category: ${profile.category}
ICP: ${profile.icp.summary}
Target roles: ${profile.icp.buyerPersonas.join(', ')}
Pain points: ${profile.icp.painPoints.join('; ')}
Competitors: ${profile.competitors.join(', ')}

Scoring:
- For B2B Leads (source=apify): 80-100 = strong ICP match (decision-maker role at relevant company/industry); 55-79 = good partial match; 25-54 = weak match.
- For Social Posts: 80-100 = asking for a tool/recommendation or switching from a competitor; 50-79 = describes a pain this product solves; 25-49 = loosely related; 0-24 = irrelevant/spam.
SPEED RULES:
1. OMIT any item with score < 25 from "results".
2. Include "reason" and "outreachAngle" (<12 words each, personalized to their role/company) when score >= 45.
3. Return JSON: {"results": [{"index": number, "score": number, "intent": "buying"|"recommendation"|"comparison"|"pain"|"competitor-churn"|"other", "reason"?: string, "outreachAngle"?: string}]}`

  const prompt = `Score relevant posts (score >= 25 only).\n\n${list}`

  const output = shouldUseVertex()
    ? await generateVertexJson({ schema: scoreSchema, instructions, prompt })
    : ((
        await generateText({
          model: getSdkModel(),
          instructions,
          output: Output.object({ schema: scoreSchema }),
          prompt,
        })
      ).output as z.infer<typeof scoreSchema>)

  return batch.map((post, i): ScoredPost => {
    const r = output.results.find((x) => x.index === i)
    return {
      ...post,
      score: r?.score ?? 10,
      intent: r?.intent ?? 'other',
      reason: r?.reason ?? '',
      outreachAngle: r?.outreachAngle ?? '',
    }
  })
}

export async function scorePosts(profile: BusinessProfile, posts: RawPost[]) {
  const BATCH = 16
  const batches: RawPost[][] = []
  for (let i = 0; i < posts.length; i += BATCH) batches.push(posts.slice(i, i + BATCH))
  const results = await Promise.allSettled(batches.map((b) => scoreBatch(profile, b)))
  return results.flatMap((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : batches[i].map((p): ScoredPost => ({ ...p, score: 0, intent: 'other', reason: 'Scoring unavailable', outreachAngle: '' })),
  )
}

async function scrapeCompetitorHero(domain: string): Promise<{ heroHeadline?: string; subheadline?: string } | null> {
  try {
    const cleanDomain = domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
    const res = await fetch(`https://${cleanDomain}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        Accept: 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(1800),
    })
    if (!res.ok) return null
    const html = await res.text()
    const h1 = html
      .match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
      ?.replace(/<[^>]+>/g, ' ')
      ?.replace(/\s+/g, ' ')
      ?.trim()
    const title = html
      .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/\s+/g, ' ')
      ?.trim()
    const desc =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.trim() ??
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.trim()
    return {
      heroHeadline: (h1 && h1.length > 6 && h1.length < 140 ? h1 : title?.slice(0, 110)) || undefined,
      subheadline: desc ? desc.slice(0, 160) : undefined,
    }
  } catch {
    return null
  }
}

export async function analyzeCompetitorsAndPositioning(params: {
  url: string
  profile: BusinessProfile
}): Promise<CompetitorAnalysisResult> {
  const { url, profile } = params
  const ownHost = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase()

  const instructions =
    'You are an elite B2B positioning & competitive intelligence strategist. Identify real, direct competitors with accurate root domains and craft a concrete positioning differentiation plan. Keep strings punchy and specific.'

  const prompt = `Company: ${profile.companyName} (${ownHost})
One-liner: ${profile.oneLiner}
Category: ${profile.category}
Value Proposition: ${profile.valueProposition}
Key Features: ${profile.keyFeatures.join(', ')}
ICP: ${profile.icp.summary} (Personas: ${profile.icp.buyerPersonas.join(', ')}; Industries: ${profile.icp.industries.join(', ')})
Pain Points Solved: ${profile.icp.painPoints.join('; ')}
Known Competitor Hints: ${profile.competitors.join(', ')}

Return a JSON object with exact keys:
{
  "positioningStrategy": {
    "categoryAnchor": string (the market category buyers place you in),
    "statusQuoProblem": string (1 sentence on why traditional alternatives frustrate buyers),
    "primaryWedge": string (1 sentence on the sharpest wedge ${profile.companyName} uses to win),
    "messagingHook": string (punchy 1-sentence positioning statement for ${profile.companyName}),
    "differentiationPillars": [
      { "title": string, "them": string (what competitors do), "us": string (how ${profile.companyName} wins) }
    ] (3 pillars)
  },
  "competitors": [
    {
      "name": string,
      "domain": string (exact root domain e.g. "apollo.io", "hubspot.com" — NEVER include ${ownHost}),
      "categoryTag": string (e.g. "Legacy Suite", "Enterprise Incumbent", "Point Solution"),
      "heroHeadline": string (their typical homepage hero headline),
      "subheadline": string (their 1-sentence value pitch),
      "ctaText": string (e.g. "Book a demo", "Start free trial"),
      "overlap": string (1 short sentence on what they offer in the same space),
      "theirWeakness": string (1 short sentence on where they fall short / frustrate buyers),
      "howWeDifferentiate": string (1 short sentence on how ${profile.companyName} differentiates in positioning),
      "winPlay": string (1 short sentence sales play when a prospect mentions them)
    }
  ] (4 to 5 real competitors)
}`

  const parsed = shouldUseVertex()
    ? await generateVertexJson({ schema: competitorAnalysisSchema, instructions, prompt })
    : ((
        await generateText({
          model: getSdkModel(),
          instructions,
          output: Output.object({ schema: competitorAnalysisSchema }),
          prompt,
        })
      ).output as z.infer<typeof competitorAnalysisSchema>)

  // Scrape live hero headlines in parallel with a tight 1.8s timeout to enrich the Website UI cards
  const enrichedCompetitors = await Promise.all(
    parsed.competitors
      .filter((c) => c.domain && !c.domain.toLowerCase().includes(ownHost))
      .slice(0, 5)
      .map(async (comp) => {
        const cleanDomain = comp.domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase()
        const scraped = await scrapeCompetitorHero(cleanDomain)
        return {
          ...comp,
          domain: cleanDomain,
          heroHeadline: scraped?.heroHeadline || comp.heroHeadline,
          subheadline: scraped?.subheadline || comp.subheadline,
          screenshotUrl: `https://s0.wp.com/mshots/v1/${encodeURIComponent(`https://${cleanDomain}`)}?w=800`,
          faviconUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(cleanDomain)}&sz=64`,
          liveScraped: Boolean(scraped?.heroHeadline),
        }
      }),
  )

  return {
    positioningStrategy: parsed.positioningStrategy,
    competitors: enrichedCompetitors,
  }
}

export async function generateCampaigns(params: {
  profile: BusinessProfile
  positioning?: CompetitorAnalysisResult['positioningStrategy'] | null
  competitors?: string[]
  leadsCount?: number
}): Promise<GeneratedCampaign[]> {
  const { profile, positioning, competitors = profile.competitors, leadsCount = 50 } = params

  const instructions =
    `You are an elite B2B outbound copywriter for founder-led sales. Write human, high-converting multi-step email sequences with zero fluff and specific value.\n\n${COLD_EMAIL_PLAYBOOK}`

  const prompt = `Company: ${profile.companyName} — ${profile.oneLiner}
Category: ${profile.category}
Value Proposition: ${profile.valueProposition}
Key Features: ${profile.keyFeatures.join(', ')}
ICP Personas: ${profile.icp.buyerPersonas.join(', ')}
ICP Industries: ${profile.icp.industries.join(', ')}
Pain Points: ${profile.icp.painPoints.join('; ')}
Buying Triggers: ${profile.icp.buyingTriggers.join('; ')}
Competitors: ${competitors.join(', ')}
${positioning ? `Positioning Wedge: ${positioning.primaryWedge}\nMessaging Hook: ${positioning.messagingHook}` : ''}

Create 4 distinct outbound campaigns:
1. angleType="pain-point" (targets the #1 operational pain point of ${profile.icp.buyerPersonas[0] || 'decision makers'})
2. angleType="competitor-wedge" (positions our wedge against ${competitors.slice(0, 2).join(' / ') || 'legacy tools'} without bashing them)
3. angleType="buying-trigger" (targets companies experiencing: ${profile.icp.buyingTriggers[0] || 'rapid team growth'})
4. angleType="executive-value" (a low-friction "give-first" teardown or benchmark offer for Founders/C-Suite)

Each campaign MUST include a 3-step email sequence:
- stepNumber 1 (delayDays: 0, label: "Day 1 · Initial Outreach")
- stepNumber 2 (delayDays: 3, label: "Day 3 · Value Follow-up")
- stepNumber 3 (delayDays: 7, label: "Day 7 · Polite Breakup")

Every "body" is plain text with real paragraph breaks: a blank line between the greeting, each short paragraph, the question and the sign-off (use "\n\n" inside the JSON string, and "\n" between "Best," and the sender name). Sign off as the team at ${profile.companyName}.

Return valid JSON matching:
{
  "campaigns": [
    {
      "id": string,
      "name": string,
      "angleType": "pain-point" | "competitor-wedge" | "buying-trigger" | "executive-value",
      "targetPersona": string,
      "targetSegment": string,
      "positioningHook": string,
      "whyItWorks": string,
      "sequence": [
        { "stepNumber": 1, "delayDays": 0, "label": string, "subject": string, "body": string },
        { "stepNumber": 2, "delayDays": 3, "label": string, "subject": string, "body": string },
        { "stepNumber": 3, "delayDays": 7, "label": string, "subject": string, "body": string }
      ]
    }
  ]
}`

  const parsed = shouldUseVertex()
    ? await generateVertexJson({ schema: campaignsSchema, instructions, prompt })
    : ((
        await generateText({
          model: getSdkModel(),
          instructions,
          output: Output.object({ schema: campaignsSchema }),
          prompt,
        })
      ).output as z.infer<typeof campaignsSchema>)

  return parsed.campaigns.map((c, idx) => ({
    ...c,
    sequence: c.sequence.map((step) => ({ ...step, body: formatEmailBody(step.body) })),
    id: c.id || `campaign-${idx + 1}`,
    matchedLeadCount: Math.max(8, Math.round(leadsCount / (idx === 0 ? 1.4 : idx === 1 ? 1.8 : 2.2))),
  }))
}
