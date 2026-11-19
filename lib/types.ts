import { z } from 'zod'

export const businessProfileSchema = z.object({
  companyName: z.string(),
  oneLiner: z.string().describe('One sentence describing what the company does'),
  category: z.string().describe('Product/market category, e.g. "B2B SaaS — CRM"'),
  businessModel: z.object({
    type: z.string().describe('e.g. B2B SaaS, D2C ecommerce, marketplace, agency, services'),
    revenueModel: z.string().describe('How they make money: subscription, usage-based, one-off, commission...'),
    pricingSignals: z.string().describe('Any pricing info found, or "Not public"'),
    salesMotion: z.string().describe('Product-led, sales-led, self-serve, hybrid...'),
  }),
  valueProposition: z.string(),
  keyFeatures: z.array(z.string()).describe('3-6 core features or offerings'),
  icp: z.object({
    summary: z.string().describe('Two sentence description of the ideal customer'),
    industries: z.array(z.string()),
    companySize: z.string(),
    geographies: z.array(z.string()),
    buyerPersonas: z.array(z.string()).describe('Job titles / roles who buy or use it'),
    painPoints: z.array(z.string()).describe('4-6 concrete problems the ICP has'),
    buyingTriggers: z.array(z.string()).describe('Events that make the ICP start looking for a solution'),
  }),
  competitors: z.array(z.string()).describe('3-6 likely competitors or alternatives'),
  keywords: z
    .array(z.string())
    .describe(
      '8-10 short (2-5 word) search phrases a potential customer would literally type in a forum post when they have buying intent or the pain this product solves. Mix: pain phrases, "alternative to <competitor>", "looking for <category>", "recommend <category>". No quotes, no hashtags.',
    ),
  hashtags: z.array(z.string()).describe('3-5 single-word hashtags (without #) the ICP uses on Mastodon/Bluesky'),
})

export type BusinessProfile = z.infer<typeof businessProfileSchema>

export type SourceId = 'reddit' | 'hackernews' | 'bluesky' | 'stackexchange' | 'lemmy' | 'mastodon' | 'github'

export type RawPost = {
  id: string
  source: SourceId
  url: string
  title: string | null
  text: string
  author: string | null
  community: string | null
  createdAt: string
  keyword: string
  engagement: number | null
}

export const intentTypes = ['buying', 'recommendation', 'comparison', 'pain', 'competitor-churn', 'other'] as const
export type IntentType = (typeof intentTypes)[number]

export type ScoredPost = RawPost & {
  score: number
  intent: IntentType
  reason: string
  outreachAngle: string
}

export type SourceStatus = {
  source: SourceId
  ok: boolean
  count: number
  error?: string
}

export type ListenResponse = {
  posts: ScoredPost[]
  sources: SourceStatus[]
  scannedAt: string
  totalScanned: number
}

export type AnalyzeResponse = {
  url: string
  profile: BusinessProfile
  pagesRead: string[]
}
