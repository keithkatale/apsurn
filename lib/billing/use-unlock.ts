'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

export type UnlockState = 'loading' | 'guest' | 'locked' | 'unlocked'

/**
 * The visitor flow: guest -> sign up (workspace is kept) -> $1 Dodo checkout popup -> $30 of sending credits.
 * `returnPath` is where sign-up and checkout bring the person back to.
 */
export function useUnlockFlow(returnPath: string) {
  const router = useRouter()
  const [state, setState] = useState<UnlockState>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const autoStarted = useRef(false)

  const refresh = useCallback(async (): Promise<UnlockState> => {
    try {
      const session = (await fetch('/api/auth/session', { cache: 'no-store' }).then((r) => r.json())) as {
        user?: boolean
        guest?: boolean
      }
      if (!session.user || session.guest) {
        setState('guest')
        return 'guest'
      }
      const res = await fetch('/api/billing/status', { cache: 'no-store' })
      const billing = res.ok ? ((await res.json()) as { active?: boolean; credits?: number }) : null
      const next: UnlockState = billing && (billing.active || (billing.credits ?? 0) > 0) ? 'unlocked' : 'locked'
      setState(next)
      return next
    } catch {
      setState('guest')
      return 'guest'
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const waitForCredits = useCallback(async () => {
    for (let i = 0; i < 20; i += 1) {
      if ((await refresh()) === 'unlocked') return
      await new Promise((r) => setTimeout(r, 2000))
    }
    setError('Still confirming your payment. Refresh in a minute if your credits do not appear.')
  }, [refresh])

  const openCheckout = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'unlock', returnTo: returnPath }),
      })
      const data = (await res.json().catch(() => ({}))) as { url?: string; mode?: 'test' | 'live'; error?: string; code?: string }
      if (res.status === 409 && data.code === 'already_unlocked') {
        await refresh()
        return
      }
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout.')

      const { DodoPayments } = await import('dodopayments-checkout')
      DodoPayments.Initialize({
        mode: data.mode ?? 'test',
        displayType: 'overlay',
        onEvent: (event) => {
          if (event.event_type === 'checkout.closed') void waitForCredits()
          if (event.event_type === 'checkout.error') setError('Checkout failed. Please try again.')
        },
      })
      DodoPayments.Checkout.open({ checkoutUrl: data.url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout.')
    } finally {
      setBusy(false)
    }
  }, [refresh, returnPath, waitForCredits])

  const start = useCallback(() => {
    if (state === 'guest') {
      router.push(`/signup?next=${encodeURIComponent(`${returnPath}?unlock=1`)}`)
      return
    }
    if (state === 'locked') void openCheckout()
  }, [openCheckout, returnPath, router, state])

  // Back from sign-up with ?unlock=1: open the $1 checkout straight away.
  useEffect(() => {
    if (state !== 'locked' || autoStarted.current) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('unlock') !== '1') return
    autoStarted.current = true
    params.delete('unlock')
    const qs = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
    void openCheckout()
  }, [openCheckout, state])

  return { state, busy, error, start, needsUnlock: state === 'guest' || state === 'locked' }
}
