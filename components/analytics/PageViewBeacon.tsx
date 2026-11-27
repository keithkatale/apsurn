'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

const COOKIE = 'apsurn_aid'
const STORAGE_KEY = 'apsurn_aid'

function getAnonId(): string {
  let id: string | null = null
  try {
    id = localStorage.getItem(STORAGE_KEY)
  } catch {
    id = null
  }
  if (!id) {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`))
    id = match?.[1] ?? null
  }
  if (!id) id = crypto.randomUUID()
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // storage blocked: the cookie below still identifies the browser
  }
  // A first-party cookie lets server-side events (signup, scan, send) join the same visitor.
  document.cookie = `${COOKIE}=${id}; Max-Age=31536000; Path=/; SameSite=Lax`
  return id
}

/** Sends one anonymous pageview per route change to our own /api/events. No IP or fingerprint is collected. */
export function PageViewBeacon() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname || /^\/(admin|api)(\/|$)/.test(pathname)) return
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return
    try {
      const body = JSON.stringify({ path: pathname, referrer: document.referrer || undefined, anonId: getAnonId() })
      if (!navigator.sendBeacon?.('/api/events', new Blob([body], { type: 'application/json' }))) {
        void fetch('/api/events', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true })
      }
    } catch {
      // analytics must never break the page
    }
  }, [pathname])

  return null
}
