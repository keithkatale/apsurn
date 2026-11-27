import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { logEvent } from '@/lib/events'
import { clientIp, rateLimit } from '@/lib/rate-limit'

const bodySchema = z.object({
  path: z.string().min(1).max(200),
  referrer: z.string().max(300).optional(),
  anonId: z.string().regex(/^[a-z0-9-]{8,64}$/i),
})

/** Public pageview beacon. Only pageviews are accepted from the browser; every other event is logged server-side. */
export async function POST(req: NextRequest) {
  // The IP only keys an in-memory rate limit. It is never stored.
  if (!rateLimit(`events:${clientIp(req)}`, 120, 60_000)) return new Response(null, { status: 204 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return new Response(null, { status: 204 })
  const { path, referrer, anonId } = parsed.data

  // Never record the admin area, API calls or Next internals.
  if (!path.startsWith('/') || /^\/(admin|api|_next)(\/|$)/.test(path)) return new Response(null, { status: 204 })

  let referrerHost: string | null = null
  if (referrer) {
    try {
      const host = new URL(referrer).hostname.replace(/^www\./, '')
      referrerHost = host === 'apsurn.com' ? null : host
    } catch {
      referrerHost = null
    }
  }

  // Strip the query string and hash so tokens in URLs are never stored.
  const cleanPath = path.split(/[?#]/)[0] || '/'
  await logEvent('pageview', { anonId, path: cleanPath, referrerHost })
  return new Response(null, { status: 204 })
}
