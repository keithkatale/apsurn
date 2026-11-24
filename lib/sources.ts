import dns from 'node:dns'
import net from 'node:net'
import { fetchApifyLeads, type ApifyLeadSearchParams } from './apify-leads'
import { htmlToText } from './scrape-site'
import type { RawPost, SourceId } from './types'

dns.setDefaultResultOrder('ipv4first')
net.setDefaultAutoSelectFamily(false)

const UA = 'Mozilla/5.0 (compatible; SignalGTM/1.0; social listening)'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function sinceDate() {
  return new Date(Date.now() - WEEK_MS)
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(4500),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? `Blocked (HTTP ${res.status})` : `HTTP ${res.status}`)
  return res.json() as Promise<T>
}

const clean = (text: string | null | undefined, max = 1200) => htmlToText(text ?? '').slice(0, max)

type Fetcher = (keyword: string, since: Date) => Promise<RawPost[]>

const hackernews: Fetcher = async (keyword, since) => {
  const params = new URLSearchParams({
    query: keyword,
    tags: '(story,comment,ask_hn)',
    numericFilters: `created_at_i>${Math.floor(since.getTime() / 1000)}`,
    hitsPerPage: '20',
  })
  type Hit = {
    objectID: string
    title?: string
    story_title?: string
    story_text?: string
    comment_text?: string
    author: string
    created_at: string
    points?: number
    url?: string
  }
  const data = await getJson<{ hits: Hit[] }>(`https://hn.algolia.com/api/v1/search_by_date?${params}`)
  return data.hits.map((hit) => ({
    id: `hn-${hit.objectID}`,
    source: 'hackernews',
    url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    title: hit.title ?? (hit.story_title ? `Re: ${hit.story_title}` : null),
    text: clean(hit.story_text ?? hit.comment_text ?? hit.title),
    author: hit.author,
    community: 'Hacker News',
    createdAt: hit.created_at,
    keyword,
    engagement: hit.points ?? null,
  }))
}

const bluesky: Fetcher = async (keyword, since) => {
  const params = new URLSearchParams({ q: keyword, sort: 'latest', since: since.toISOString(), limit: '25', lang: 'en' })
  type BskyPost = {
    uri: string
    author: { handle: string; displayName?: string }
    record: { text: string; createdAt: string }
    likeCount?: number
    replyCount?: number
  }
  const data = await getJson<{ posts: BskyPost[] }>(`https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?${params}`)
  return data.posts.map((post) => {
    const rkey = post.uri.split('/').pop()
    return {
      id: `bsky-${post.uri}`,
      source: 'bluesky',
      url: `https://bsky.app/profile/${post.author.handle}/post/${rkey}`,
      title: null,
      text: clean(post.record.text),
      author: post.author.displayName || post.author.handle,
      community: 'Bluesky',
      createdAt: post.record.createdAt,
      keyword,
      engagement: (post.likeCount ?? 0) + (post.replyCount ?? 0),
    }
  })
}

const reddit: Fetcher = async (keyword) => {
  const params = new URLSearchParams({ q: keyword, sort: 'new', t: 'week', limit: '25', raw_json: '1' })
  type Child = {
    data: {
      id: string
      title: string
      selftext: string
      author: string
      subreddit_name_prefixed: string
      created_utc: number
      permalink: string
      score: number
      num_comments: number
    }
  }
  const data = await getJson<{ data: { children: Child[] } }>(`https://www.reddit.com/search.json?${params}`)
  return data.data.children.map(({ data: post }) => ({
    id: `reddit-${post.id}`,
    source: 'reddit',
    url: `https://www.reddit.com${post.permalink}`,
    title: post.title,
    text: clean(post.selftext || post.title),
    author: post.author,
    community: post.subreddit_name_prefixed,
    createdAt: new Date(post.created_utc * 1000).toISOString(),
    keyword,
    engagement: post.score + post.num_comments,
  }))
}

const stackexchange: Fetcher = async (keyword, since) => {
  const params = new URLSearchParams({
    order: 'desc',
    sort: 'creation',
    q: keyword,
    site: 'stackoverflow',
    pagesize: '15',
    fromdate: String(Math.floor(since.getTime() / 1000)),
    filter: 'withbody',
  })
  type Item = {
    question_id: number
    title: string
    body: string
    link: string
    creation_date: number
    score: number
    owner?: { display_name?: string }
    tags: string[]
  }
  const data = await getJson<{ items: Item[] }>(`https://api.stackexchange.com/2.3/search/advanced?${params}`)
  return data.items.map((item) => ({
    id: `se-${item.question_id}`,
    source: 'stackexchange',
    url: item.link,
    title: clean(item.title, 300),
    text: clean(item.body),
    author: item.owner?.display_name ?? null,
    community: item.tags.slice(0, 3).map((t) => `#${t}`).join(' ') || 'Stack Overflow',
    createdAt: new Date(item.creation_date * 1000).toISOString(),
    keyword,
    engagement: item.score,
  }))
}

const lemmy: Fetcher = async (keyword) => {
  const params = new URLSearchParams({ q: keyword, type_: 'Posts', sort: 'New', limit: '20' })
  type LemmyPost = {
    post: { id: number; name: string; body?: string; ap_id: string; published: string }
    creator: { name: string }
    community: { name: string }
    counts: { score: number; comments: number }
  }
  const data = await getJson<{ posts: LemmyPost[] }>(`https://lemmy.world/api/v3/search?${params}`)
  return data.posts.map((p) => ({
    id: `lemmy-${p.post.id}`,
    source: 'lemmy',
    url: p.post.ap_id,
    title: p.post.name,
    text: clean(p.post.body || p.post.name),
    author: p.creator.name,
    community: `c/${p.community.name}`,
    createdAt: p.post.published,
    keyword,
    engagement: p.counts.score + p.counts.comments,
  }))
}

const github: Fetcher = async (keyword, since) => {
  const q = `"${keyword.replace(/"/g, '')}" in:title,body is:issue -author:app/dependabot -author:app/renovate created:>${since.toISOString().slice(0, 10)}`
  const params = new URLSearchParams({ q, sort: 'created', order: 'desc', per_page: '15' })
  type Issue = {
    id: number
    title: string
    body: string | null
    html_url: string
    created_at: string
    user: { login: string }
    repository_url: string
    comments: number
    reactions?: { total_count: number }
  }
  const data = await getJson<{ items: Issue[] }>(`https://api.github.com/search/issues?${params}`, {
    headers: { Accept: 'application/vnd.github+json' },
  })
  return data.items.map((issue) => ({
    id: `gh-${issue.id}`,
    source: 'github',
    url: issue.html_url,
    title: issue.title,
    text: clean(issue.body || issue.title),
    author: issue.user.login,
    community: issue.repository_url.split('/repos/')[1] ?? 'GitHub',
    createdAt: issue.created_at,
    keyword,
    engagement: issue.comments + (issue.reactions?.total_count ?? 0),
  }))
}

async function mastodonTag(tag: string): Promise<RawPost[]> {
  type Status = {
    id: string
    url: string | null
    uri: string
    content: string
    created_at: string
    account: { acct: string; display_name: string }
    favourites_count: number
    replies_count: number
    reblog: unknown
  }
  const safeTag = tag.replace(/[^a-z0-9_]/gi, '')
  if (!safeTag) return []
  const data = await getJson<Status[]>(`https://mastodon.social/api/v1/timelines/tag/${safeTag}?limit=40`)
  return data
    .filter((s) => !s.reblog)
    .map((s) => ({
      id: `masto-${s.id}`,
      source: 'mastodon',
      url: s.url ?? s.uri,
      title: null,
      text: clean(s.content),
      author: s.account.display_name || s.account.acct,
      community: `#${safeTag}`,
      createdAt: s.created_at,
      keyword: `#${safeTag}`,
      engagement: s.favourites_count + s.replies_count,
    }))
}

const keywordFetchers: Record<Exclude<SourceId, 'mastodon' | 'apify'>, { fetch: Fetcher; maxKeywords: number }> = {
  reddit: { fetch: reddit, maxKeywords: 6 },
  hackernews: { fetch: hackernews, maxKeywords: 10 },
  bluesky: { fetch: bluesky, maxKeywords: 10 },
  stackexchange: { fetch: stackexchange, maxKeywords: 4 },
  lemmy: { fetch: lemmy, maxKeywords: 6 },
  github: { fetch: github, maxKeywords: 4 },
}

export async function runListening(
  keywords: string[],
  hashtags: string[],
  enabled: SourceId[],
  apifyParams?: ApifyLeadSearchParams,
) {
  const since = sinceDate()
  const tasks: { source: SourceId; run: () => Promise<RawPost[]> }[] = []

  if (enabled.includes('apify') && apifyParams) {
    tasks.push({
      source: 'apify',
      run: () => fetchApifyLeads(apifyParams),
    })
  }

  for (const [source, config] of Object.entries(keywordFetchers) as [SourceId, { fetch: Fetcher; maxKeywords: number }][]) {
    if (!enabled.includes(source)) continue
    for (const keyword of keywords.slice(0, config.maxKeywords)) {
      tasks.push({ source, run: () => config.fetch(keyword, since) })
    }
  }
  if (enabled.includes('mastodon')) {
    for (const tag of hashtags.slice(0, 5)) tasks.push({ source: 'mastodon', run: () => mastodonTag(tag) })
  }

  const results = await Promise.allSettled(tasks.map((t) => t.run()))

  const statusMap = new Map<SourceId, { ok: number; failed: number; count: number; error?: string }>()
  const posts: RawPost[] = []
  results.forEach((result, i) => {
    const { source } = tasks[i]
    const entry = statusMap.get(source) ?? { ok: 0, failed: 0, count: 0 }
    if (result.status === 'fulfilled') {
      entry.ok++
      const fresh =
        source === 'apify'
          ? result.value
          : result.value.filter((p) => new Date(p.createdAt).getTime() >= since.getTime() && p.text.length > 20)
      entry.count += fresh.length
      posts.push(...fresh)
    } else {
      entry.failed++
      entry.error = result.reason instanceof Error ? result.reason.message : 'Request failed'
    }
    statusMap.set(source, entry)
  })

  const seen = new Set<string>()
  const unique = posts.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  const sources = enabled.map((source) => {
    const s = statusMap.get(source)
    return {
      source,
      ok: !!s && s.ok > 0,
      count: s?.count ?? 0,
      error: s && s.ok === 0 ? s.error : undefined,
    }
  })

  return { posts: unique, sources }
}
