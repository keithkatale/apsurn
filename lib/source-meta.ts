import type { IntentType, SourceId } from './types'

export const SOURCES: { id: SourceId; label: string; note: string }[] = [
  { id: 'apify', label: 'Apify B2B Leads', note: 'peakydev/leads-scraper-ppe · Verified emails, phones & LinkedIn' },
  { id: 'hackernews', label: 'Hacker News', note: 'Stories & comments via public Algolia index' },
  { id: 'bluesky', label: 'Bluesky', note: 'Public AppView search' },
  { id: 'stackexchange', label: 'Stack Overflow', note: 'Public Stack Exchange API' },
  { id: 'lemmy', label: 'Lemmy', note: 'lemmy.world federated search' },
  { id: 'mastodon', label: 'Mastodon', note: 'Hashtag timelines on mastodon.social' },
  { id: 'github', label: 'GitHub', note: 'Issues & discussions search' },
  { id: 'linkedin', label: 'LinkedIn', note: 'Posts via Apify (paid workspaces)' },
]

export const sourceLabel = (id: SourceId) => SOURCES.find((s) => s.id === id)?.label ?? id

export const INTENT_LABELS: Record<IntentType, string> = {
  buying: 'High ICP fit',
  recommendation: 'Asking for recs',
  comparison: 'Comparing options',
  pain: 'Pain-point match',
  'competitor-churn': 'Competitor user',
  other: 'General match',
}
