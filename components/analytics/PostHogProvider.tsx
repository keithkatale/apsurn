'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'

// The project token is a public, write-only key (it ships to every browser), so it is safe to keep in code.
const POSTHOG_KEY =
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || 'phc_Cf6zsfCVLp8Kf4wvcJMi4Nr7tATkeNPcPkXCZBZntsdi'
// Default: our own /ingest path (see next.config.mjs) so ad blockers do not drop events.
// Set NEXT_PUBLIC_POSTHOG_HOST (e.g. https://us.i.posthog.com) to send straight to PostHog instead.
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || '/ingest'
const POSTHOG_UI_HOST = 'https://us.posthog.com'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (posthog.__loaded) return
    // No analytics noise from local development.
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return

    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      ui_host: POSTHOG_UI_HOST,
      defaults: '2026-08-30',
      person_profiles: 'identified_only',
    })

    // Link events to the account once someone has a real (non-guest) session.
    fetch('/api/auth/session', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((session: { user?: boolean; guest?: boolean; userId?: string; email?: string | null } | null) => {
        if (session?.user && !session.guest && session.userId) {
          posthog.identify(session.userId, session.email ? { email: session.email } : undefined)
        }
      })
      .catch(() => {})
  }, [])

  return <>{children}</>
}
