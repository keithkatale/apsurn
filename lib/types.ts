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

export type SourceId =
  | 'apify'
  | 'hackernews'
  | 'bluesky'
  | 'stackexchange'
  | 'lemmy'
  | 'mastodon'
  | 'github'
  | 'linkedin'

export const SENIORITY_OPTIONS = [
  { id: 'founder', label: 'Founder' },
  { id: 'owner', label: 'Owner' },
  { id: 'c_suite', label: 'C-Suite' },
  { id: 'vp', label: 'VP' },
  { id: 'head', label: 'Head' },
  { id: 'director', label: 'Director' },
  { id: 'manager', label: 'Manager' },
  { id: 'senior', label: 'Senior' },
] as const

export type SeniorityId = (typeof SENIORITY_OPTIONS)[number]['id']

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
  lead?: {
    fullName: string
    jobTitle: string | null
    seniority: string | null
    department: string | null
    email: string | null
    phone: string | null
    linkedinUrl: string | null
    location: string | null
    companyName: string | null
    companyWebsite: string | null
    companyLinkedinUrl: string | null
    companyIndustry: string | null
    companySize: string | null
    companyRevenue: string | null
  }
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
  companyId?: string
  profile: BusinessProfile
  pagesRead: string[]
}

export const competitorAnalysisSchema = z.object({
  positioningStrategy: z.object({
    categoryAnchor: z.string().describe('The exact market category buyers put you in'),
    statusQuoProblem: z.string().describe('Why existing competitors frustrate buyers'),
    primaryWedge: z.string().describe('Your sharpest positioning wedge to win deals'),
    messagingHook: z.string().describe('A 1-sentence hero positioning statement that sets you apart'),
    differentiationPillars: z.array(
      z.object({
        title: z.string(),
        them: z.string().describe('What competitors typically do'),
        us: z.string().describe('How this business does it better/differently'),
      }),
    ),
  }),
  competitors: z.array(
    z.object({
      name: z.string(),
      domain: z.string().describe('Clean root domain e.g. apollo.io, hubspot.com'),
      categoryTag: z.string().describe('e.g. Legacy Incumbent, Point Solution, All-in-One'),
      heroHeadline: z.string().describe('Their main website hero pitch / headline'),
      subheadline: z.string().describe('Their supporting website subheadline'),
      ctaText: z.string().describe('Their primary website CTA button text e.g. Book a Demo, Start Free'),
      overlap: z.string().describe('What they offer that overlaps with this business'),
      theirWeakness: z.string().describe('Specific gap, complexity, or pricing weakness buyers complain about'),
      howWeDifferentiate: z.string().describe('How to position against them to win'),
      winPlay: z.string().describe('1-sentence sales rebuttal when a prospect mentions this competitor'),
    }),
  ),
})

export type CompetitorAnalysisResult = {
  positioningStrategy: z.infer<typeof competitorAnalysisSchema>['positioningStrategy']
  competitors: Array<
    z.infer<typeof competitorAnalysisSchema>['competitors'][number] & {
      screenshotUrl: string
      faviconUrl: string
      liveScraped?: boolean
    }
  >
}

export const campaignsSchema = z.object({
  campaigns: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      angleType: z.enum(['pain-point', 'competitor-wedge', 'buying-trigger', 'executive-value']).catch('pain-point'),
      targetPersona: z.string(),
      targetSegment: z.string(),
      positioningHook: z.string().describe('1-sentence hook explaining why this campaign converts'),
      whyItWorks: z.string(),
      sequence: z.array(
        z.object({
          stepNumber: z.number().int(),
          delayDays: z.number().int(),
          label: z.string().describe('e.g. Day 1 · Cold Intro, Day 3 · Value Follow-up, Day 7 · Breakup'),
          subject: z.string().describe('Email subject line using {{firstName}} or {{companyName}}'),
          body: z.string().describe('Concise, non-spammy 50-75 word plain-text email using {{firstName}}, {{companyName}}, {{jobTitle}}'),
        }),
      ),
    }),
  ),
})

export type GeneratedCampaign = z.infer<typeof campaignsSchema>['campaigns'][number] & {
  matchedLeadCount?: number
}

export type CampaignsResponse = {
  campaigns: GeneratedCampaign[]
}
