import dns from 'node:dns'
import net from 'node:net'

dns.setDefaultResultOrder('ipv4first')
net.setDefaultAutoSelectFamily(false)

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

const SUBPAGE_PATTERN = /(about|pricing|price|plans|product|features|solutions|customers|use-cases|how-it-works|services)/i
const MAX_PAGE_CHARS = 5000
const MAX_SUBPAGE_CHARS = 2500

export function normalizeUrl(input: string): URL {
  const trimmed = input.trim()
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const url = new URL(withProtocol)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) URLs are supported')
  if (isPrivateHost(url.hostname)) throw new Error('That address is not publicly reachable')
  if (!url.hostname.includes('.')) throw new Error('Please enter a full domain, e.g. acme.com')
  return url
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true
  if (host === '[::1]' || host.startsWith('[fc') || host.startsWith('[fd')) return true
  return false
}

async function fetchHtml(url: string, timeoutMs = 6000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('html')) throw new Error('Not an HTML page')
  return { html: await res.text(), finalUrl: res.url || url }
}

function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/section)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

function extractMeta(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? ''
  const description =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
    ''
  return { title: decodeEntities(title), description: decodeEntities(description) }
}

function findSubpages(html: string, base: URL) {
  const links = new Set<string>()
  for (const match of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    try {
      const link = new URL(match[1], base)
      if (link.hostname !== base.hostname) continue
      if (!SUBPAGE_PATTERN.test(link.pathname)) continue
      if (link.pathname.split('/').filter(Boolean).length > 2) continue
      link.search = ''
      links.add(link.toString())
    } catch {
      // ignore malformed hrefs
    }
  }
  return [...links].slice(0, 2)
}

export async function scrapeBusinessSite(input: string) {
  const url = normalizeUrl(input)
  const home = await fetchHtml(url.toString(), 5000)
  const finalUrl = new URL(home.finalUrl)
  const meta = extractMeta(home.html)
  const homeText = htmlToText(home.html).slice(0, MAX_PAGE_CHARS)

  const pages: { url: string; text: string }[] = [
    { url: finalUrl.toString(), text: homeText },
  ]

  // Only wait up to 1.5s for subpages so slow secondary pages never bottleneck analysis
  const subpages = await Promise.allSettled(
    findSubpages(home.html, finalUrl).map(async (link) => {
      const { html } = await fetchHtml(link, 1500)
      return { url: link, text: htmlToText(html).slice(0, MAX_SUBPAGE_CHARS) }
    }),
  )
  for (const result of subpages) {
    if (result.status === 'fulfilled' && result.value.text.length > 200) pages.push(result.value)
  }

  return { url: finalUrl.toString(), meta, pages }
}
