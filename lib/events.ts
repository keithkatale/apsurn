import { cookies, headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

/** Names we record. Anything else is dropped, so a bad client cannot fill the table with junk. */
export const EVENT_NAMES = [
  'pageview',
  'signup',
  'login',
  'analyze',
  'leads_found',
  'campaigns_generated',
  'email_sent',
  'scan',
  'checkout_started',
  'payment_succeeded',
  'subscription_changed',
  'report_claimed',
] as const
export type EventName = (typeof EVENT_NAMES)[number]

export const ANON_COOKIE = 'apsurn_aid'

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python-requests|go-http/i

export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT.test(userAgent)
}

export function deviceOf(userAgent: string | null | undefined): 'mobile' | 'tablet' | 'desktop' {
  const ua = userAgent ?? ''
  if (/ipad|tablet/i.test(ua)) return 'tablet'
  if (/mobi|android|iphone/i.test(ua)) return 'mobile'
  return 'desktop'
}

type LogOptions = {
  userId?: string | null
  anonId?: string | null
  path?: string | null
  referrerHost?: string | null
  props?: Record<string, string | number | boolean | null>
}

/**
 * Records one event. Never throws and never blocks the caller for long: analytics must not break the product.
 * Call it from server code (route handlers). The anonymous id is read from our own cookie when not given.
 */
export async function logEvent(name: EventName, options: LogOptions = {}): Promise<void> {
  try {
    const h = await headers()
    const ua = h.get('user-agent')
    // Only pageviews are filtered for bots; the other events come from signed-in actions or our billing webhook.
    if (name === 'pageview' && isBot(ua)) return
    let anonId = options.anonId ?? null
    if (!anonId) {
      try {
        anonId = (await cookies()).get(ANON_COOKIE)?.value ?? null
      } catch {
        anonId = null
      }
    }
    const props = Object.fromEntries(
      Object.entries(options.props ?? {})
        .slice(0, 10)
        .map(([k, v]) => [k.slice(0, 40), typeof v === 'string' ? v.slice(0, 200) : v]),
    )
    await createAdminClient()
      .from('apsurn_events')
      .insert({
        name,
        user_id: options.userId ?? null,
        anon_id: anonId ? anonId.slice(0, 64) : null,
        path: options.path ? options.path.slice(0, 200) : null,
        referrer_host: options.referrerHost ? options.referrerHost.slice(0, 120) : null,
        device: deviceOf(ua),
        props,
      })
  } catch {
    // swallow: logging is best effort
  }
}
