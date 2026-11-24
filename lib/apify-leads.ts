import dns from 'node:dns'
import net from 'node:net'
import type { RawPost, SeniorityId } from './types'

dns.setDefaultResultOrder('ipv4first')
net.setDefaultAutoSelectFamily(false)

export const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID?.trim() || 'peakydev/leads-scraper-ppe'

const VALID_COUNTRIES = new Set([
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'India',
  'Netherlands',
  'Singapore',
  'United Arab Emirates',
  'Ireland',
  'Spain',
  'Italy',
  'Sweden',
  'Switzerland',
  'Brazil',
  'Mexico',
  'Israel',
  'Japan',
  'New Zealand',
])

const COUNTRY_ALIASES: Record<string, string> = {
  us: 'United States',
  usa: 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  'united states of america': 'United States',
  'north america': 'United States',
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  britain: 'United Kingdom',
  england: 'United Kingdom',
  uae: 'United Arab Emirates',
  global: 'United States',
  worldwide: 'United States',
  europe: 'United Kingdom',
  eu: 'Germany',
}

export function normalizeCountries(inputs: string[]): string[] {
  const matched = new Set<string>()
  for (const raw of inputs) {
    const trimmed = raw.trim()
    if (!trimmed) continue
    if (VALID_COUNTRIES.has(trimmed)) {
      matched.add(trimmed)
      continue
    }
    const lower = trimmed.toLowerCase()
    if (COUNTRY_ALIASES[lower]) {
      matched.add(COUNTRY_ALIASES[lower])
      continue
    }
    for (const valid of VALID_COUNTRIES) {
      if (valid.toLowerCase() === lower || lower.includes(valid.toLowerCase())) {
        matched.add(valid)
      }
    }
  }
  return matched.size > 0 ? [...matched] : ['United States']
}

export function getConfiguredApifyTokens(overrideToken?: string): string[] {
  const tokens: string[] = []
  if (overrideToken?.trim()) {
    tokens.push(
      ...overrideToken
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    )
  }
  if (process.env.APIFY_API_TOKENS) {
    tokens.push(
      ...process.env.APIFY_API_TOKENS.split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    )
  }
  if (process.env.APIFY_API_TOKEN?.trim()) {
    tokens.push(process.env.APIFY_API_TOKEN.trim())
  }
  return [...new Set(tokens)]
}

export type ApifyLeadSearchParams = {
  personTitle: string[]
  webKeywords: string[]
  personCountry: string[]
  seniority?: SeniorityId[]
  totalResults?: number
  apifyToken?: string
}

type PeakyLeadItem = {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  phoneType?: string | null
  title?: string | null
  department?: string | null
  seniority?: string | null
  linkedinUrl?: string | null
  twitterUrl?: string | null
  bio?: string | null
  skills?: string[] | string | null
  city?: string | null
  state?: string | null
  country?: string | null
  organizationName?: string | null
  organizationWebsite?: string | null
  organizationEmailDomain?: string | null
  organizationIndustry?: string | null
  organizationSize?: string | number | null
  organizationEmployeeRange?: string | null
  organizationRevenue?: string | null
  organizationLinkedinUrl?: string | null
  organizationCity?: string | null
  organizationState?: string | null
  organizationCountry?: string | null
  organizationDescription?: string | null
  organizationKeywords?: string[] | string | null
}

export async function fetchApifyLeads(params: ApifyLeadSearchParams): Promise<RawPost[]> {
  const tokens = getConfiguredApifyTokens(params.apifyToken)
  if (tokens.length === 0) {
    throw new Error('No Apify API token configured. Set APIFY_API_TOKEN in .env.local or paste your token in the sidebar.')
  }

  const actorSlug = APIFY_ACTOR_ID.replace('/', '~')
  const countries = normalizeCountries(params.personCountry)
  const personTitle = params.personTitle.map((t) => t.trim()).filter(Boolean).slice(0, 20)
  const webKeywords = params.webKeywords.map((k) => k.trim()).filter(Boolean).slice(0, 15)

  const actorInput: Record<string, unknown> = {
    totalResults: Math.max(100, Math.min(1000, params.totalResults ?? 100)),
    companyMode: false,
  }

  if (personTitle.length > 0) actorInput.personTitle = personTitle
  if (webKeywords.length > 0) actorInput.webKeywords = webKeywords
  if (countries.length > 0) actorInput.personCountry = countries
  if (params.seniority && params.seniority.length > 0) actorInput.seniority = params.seniority

  const errors: string[] = []

  for (const token of tokens) {
    const masked = `${token.slice(0, 14)}...`
    try {
      const url = `https://api.apify.com/v2/acts/${actorSlug}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=110&limit=100`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(actorInput),
        signal: AbortSignal.timeout(115_000),
        cache: 'no-store',
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        let detail = `HTTP ${res.status}`
        try {
          const parsed = JSON.parse(errBody)
          if (parsed?.error?.message) detail = `${parsed.error.message} (HTTP ${res.status})`
        } catch {
          if (errBody) detail = `${detail}: ${errBody.slice(0, 120)}`
        }
        errors.push(`${masked}: ${detail}`)
        // Try next token if unauthorized or payment/limit issue
        if (res.status === 401 || res.status === 402 || res.status === 403) continue
        throw new Error(detail)
      }

      const items = (await res.json()) as PeakyLeadItem[]
      if (!Array.isArray(items)) {
        throw new Error('Unexpected response format from Apify dataset')
      }

      // Filter out actor status/progress banner rows that only populate firstName
      const realLeads = items.filter((item) => Boolean(item.lastName || item.email || item.title || item.organizationName))

      const nowIso = new Date().toISOString()
      return realLeads.map((item, idx): RawPost => {
        const fullName = [item.firstName, item.lastName].filter(Boolean).join(' ').trim() || 'Unknown Contact'
        const jobTitle = item.title?.trim() || null
        const companyName = item.organizationName?.trim() || item.organizationEmailDomain?.trim() || null
        const locationParts = [item.city || item.organizationCity, item.state || item.organizationState, item.country || item.organizationCountry].filter(Boolean)
        const location = locationParts.length > 0 ? [...new Set(locationParts)].join(', ') : null
        const companySize = item.organizationEmployeeRange || (item.organizationSize ? `${item.organizationSize} employees` : null)
        const companyIndustry = item.organizationIndustry || null
        const description = item.organizationDescription || item.bio || ''
        const keywordsStr = Array.isArray(item.organizationKeywords)
          ? item.organizationKeywords.slice(0, 8).join(', ')
          : typeof item.organizationKeywords === 'string'
            ? item.organizationKeywords.slice(0, 200)
            : ''

        const rawWebsite = item.organizationWebsite || item.organizationEmailDomain || null
        const companyWebsite = rawWebsite ? (rawWebsite.startsWith('http') ? rawWebsite : `https://${rawWebsite}`) : null

        const summaryLines = [
          [companyIndustry, companySize ? `${companySize} employees` : null, item.organizationRevenue ? `Rev: $${item.organizationRevenue}` : null, location]
            .filter(Boolean)
            .join(' · '),
          description ? description.slice(0, 400) : '',
          keywordsStr ? `Keywords: ${keywordsStr}` : '',
        ].filter(Boolean)

        const primaryUrl =
          item.linkedinUrl ||
          companyWebsite ||
          item.organizationLinkedinUrl ||
          (item.email ? `mailto:${item.email}` : 'https://apify.com/peakydev/leads-scraper-ppe')

        return {
          id: `apify-${idx}-${item.email || item.linkedinUrl || fullName.replace(/\s+/g, '-')}`,
          source: 'apify',
          url: primaryUrl,
          title: jobTitle && companyName ? `${fullName} · ${jobTitle} @ ${companyName}` : fullName,
          text: summaryLines.join('\n'),
          author: item.email || fullName,
          community: companyName || companyIndustry || 'Apify Leads',
          createdAt: nowIso,
          keyword: jobTitle || personTitle[0] || 'ICP Lead',
          engagement: null,
          lead: {
            fullName,
            jobTitle,
            seniority: item.seniority || null,
            department: item.department || null,
            email: item.email || null,
            phone: item.phone || null,
            linkedinUrl: item.linkedinUrl || null,
            location,
            companyName,
            companyWebsite,
            companyLinkedinUrl: item.organizationLinkedinUrl || null,
            companyIndustry,
            companySize,
            companyRevenue: item.organizationRevenue || null,
          },
        }
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      errors.push(`${masked}: ${msg}`)
    }
  }

  throw new Error(`Apify (${APIFY_ACTOR_ID}) failed — ${errors.join(' | ')}`)
}
