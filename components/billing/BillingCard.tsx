'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ThreeDButton } from '@/components/buttons/three-d-button'
import { MONEY_BACK_DAYS, OFFERED_PLAN_KEYS, PLANS, TOPUPS, contactCostLabel, type PlanKey, type TopupKey } from '@/lib/billing/plans'

type Billing = {
  planKey: PlanKey | null
  status: string | null
  active: boolean
  planCredits: number
  topupCredits: number
  credits: number
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  dodoCustomerId: string | null
  billingEnabled: boolean
}

type CheckoutResult = { url?: string; changed?: boolean; error?: string; code?: string }

function formatDate(iso: string | null) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusLabel(b: Billing) {
  if (!b.planKey) return 'No plan'
  if (b.status === 'on_hold') return 'Payment failed — update your card'
  if (b.status === 'past_due') return 'Payment past due'
  if (b.status === 'cancelled' || b.status === 'expired' || b.status === 'failed') return 'Inactive'
  if (b.cancelAtPeriodEnd) return `Cancels ${formatDate(b.currentPeriodEnd) ?? 'at period end'}`
  return 'Active'
}

export function BillingCard() {
  const router = useRouter()
  const params = useSearchParams()
  const [billing, setBilling] = useState<Billing | null>(null)
  const [signedOut, setSignedOut] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const autoStarted = useRef(false)

  const load = useCallback(async (): Promise<Billing | null> => {
    try {
      const res = await fetch('/api/billing/status', { cache: 'no-store' })
      if (res.status === 401) {
        setSignedOut(true)
        return null
      }
      const data = (await res.json()) as Billing
      if (!res.ok) throw new Error('Could not load billing')
      setBilling(data)
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load billing')
      return null
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const startCheckout = useCallback(
    async (payload: { kind: 'plan'; plan: PlanKey } | { kind: 'topup'; topup: TopupKey }, key: string) => {
      setBusy(key)
      setError(null)
      try {
        const res = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = (await res.json().catch(() => ({}))) as CheckoutResult
        if (res.status === 403 && data.code === 'account_required') {
          const next = payload.kind === 'plan' ? `/settings?plan=${payload.plan}` : '/settings'
          router.push(`/signup?next=${encodeURIComponent(next)}`)
          return
        }
        if (res.status === 401) {
          router.push(`/login?next=${encodeURIComponent('/settings')}`)
          return
        }
        if (!res.ok) throw new Error(data.error || 'Could not start checkout')
        if (data.url) {
          window.location.assign(data.url)
          return
        }
        if (data.changed) {
          setNotice('Plan updated. Your credits will refresh in a moment.')
          await load()
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start checkout')
      } finally {
        setBusy(null)
      }
    },
    [load, router],
  )

  // Landing-page pricing links arrive as /settings?plan=startup — start that checkout once.
  useEffect(() => {
    const wanted = params.get('plan') as PlanKey | null
    if (!billing || autoStarted.current || !wanted || !(OFFERED_PLAN_KEYS as readonly string[]).includes(wanted)) return
    autoStarted.current = true
    if (!(billing.planKey && billing.active)) void startCheckout({ kind: 'plan', plan: wanted }, `plan:${wanted}`)
  }, [billing, params, startCheckout])

  // Back from Dodo: the webhook can lag a few seconds, so poll until the account reflects the purchase.
  useEffect(() => {
    const result = params.get('billing')
    if (!result) return
    setNotice(result === 'topup' ? 'Thanks! Adding your credits…' : 'Thanks! Activating your plan…')
    let tries = 0
    const startCredits = billing?.credits ?? 0
    const timer = window.setInterval(async () => {
      tries += 1
      const next = await load()
      const done = result === 'topup' ? (next?.credits ?? 0) > startCredits : Boolean(next?.active)
      if (done) {
        setNotice(result === 'topup' ? 'Credits added.' : 'Your plan is active.')
        window.clearInterval(timer)
      } else if (tries >= 15) {
        setNotice('Still processing. Refresh in a minute if your plan does not appear.')
        window.clearInterval(timer)
      }
    }, 2000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  async function openPortal() {
    setBusy('portal')
    setError(null)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not open the billing portal')
      window.location.assign(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the billing portal')
      setBusy(null)
    }
  }

  if (signedOut) {
    return (
      <section className="rounded-2xl border border-[color-mix(in_srgb,var(--mh-fg)_16%,transparent)] bg-[color-mix(in_srgb,var(--mh-fg)_4%,var(--mh-bg))] p-5 shadow-sm">
        <p className="text-sm text-[var(--mh-fg)]">Create an account to choose a plan and get credits.</p>
        <div className="mt-3">
          <ThreeDButton href="/signup?next=%2Fsettings" variant="solid" size="sm">
            Create account
          </ThreeDButton>
        </div>
      </section>
    )
  }

  if (!billing) {
    return (
      <section className="rounded-2xl border border-[color-mix(in_srgb,var(--mh-fg)_16%,transparent)] bg-[color-mix(in_srgb,var(--mh-fg)_4%,var(--mh-bg))] p-5 shadow-sm text-sm text-[var(--mh-muted)]">
        {error ?? 'Loading billing…'}
      </section>
    )
  }

  const outlineBtn =
    "inline-flex h-8 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--mh-fg)_28%,transparent)] bg-[var(--mh-bg)] px-3 text-[13px] font-medium text-[var(--mh-fg)] shadow-sm transition-colors hover:bg-[color-mix(in_srgb,var(--mh-fg)_8%,var(--mh-bg))] disabled:cursor-not-allowed disabled:opacity-50"
  const current = billing.planKey ? PLANS[billing.planKey] : null
  const renews = formatDate(billing.currentPeriodEnd)

  return (
    <section className="space-y-5 rounded-2xl border border-[color-mix(in_srgb,var(--mh-fg)_16%,transparent)] bg-[color-mix(in_srgb,var(--mh-fg)_4%,var(--mh-bg))] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--mh-fg)]">
            {current ? `${current.name} plan` : 'No plan yet'}
          </h3>
          <p className="mt-0.5 text-[13px] text-[var(--mh-muted)]">
            {statusLabel(billing)}
            {billing.active && !billing.cancelAtPeriodEnd && renews ? ` · renews ${renews}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tracking-tight text-[var(--mh-fg)]">{billing.credits.toLocaleString()}</p>
          <p className="text-[12px] text-[var(--mh-muted)]">
            credits
            {billing.topupCredits > 0 ? ` · ${billing.topupCredits.toLocaleString()} from top-ups` : ''}
          </p>
        </div>
      </div>

      {!billing.billingEnabled && (
        <p className="rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-[12px] text-amber-900">
          Billing isn&apos;t configured on this server yet (missing Dodo Payments keys).
        </p>
      )}
      {notice && <p className="rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 text-[12px] text-emerald-900">{notice}</p>}
      {error && <p className="text-[12px] text-red-600">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {OFFERED_PLAN_KEYS.map((key) => {
          const plan = PLANS[key]
          const isCurrent = billing.active && billing.planKey === key
          return (
            <div
              key={key}
              className={`rounded-xl border bg-[var(--mh-bg)] p-4 shadow-sm ${isCurrent ? 'border-2 border-[var(--mh-fg)]' : 'border-[color-mix(in_srgb,var(--mh-fg)_18%,transparent)]'}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-[var(--mh-fg)]">{plan.name}</span>
                <span className="text-sm text-[var(--mh-fg)]">
                  ${plan.priceUsd}
                  <span className="text-[12px] text-[var(--mh-muted)]">/mo</span>
                </span>
              </div>
              <p className="mt-1 text-[12px] text-[var(--mh-muted)]">{plan.creditsPerMonth.toLocaleString()} credits every month · {contactCostLabel()}</p>
              <div className="mt-3">
                {isCurrent ? (
                  <span className="text-[12px] font-semibold text-[var(--mh-fg)]">✓ Current plan</span>
                ) : (
                  billing.planKey && billing.active ? (
                    <button
                      type="button"
                      className={outlineBtn}
                      disabled={busy !== null || !billing.billingEnabled}
                      onClick={() => void startCheckout({ kind: 'plan', plan: key }, `plan:${key}`)}
                    >
                      {busy === `plan:${key}` ? 'Opening…' : `Switch to ${plan.name}`}
                    </button>
                  ) : (
                    <ThreeDButton
                      type="button"
                      variant="solid"
                      size="sm"
                      disabled={busy !== null || !billing.billingEnabled}
                      onClick={() => void startCheckout({ kind: 'plan', plan: key }, `plan:${key}`)}
                    >
                      {busy === `plan:${key}` ? 'Opening…' : `Get ${plan.name} · $${plan.priceUsd} today`}
                    </ThreeDButton>
                  )
                )}
                {!isCurrent && !(billing.planKey && billing.active) && (
                  <p className="mt-2 text-[11px] text-[var(--mh-muted)]">{MONEY_BACK_DAYS}-day money-back guarantee</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {billing.active && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[color-mix(in_srgb,var(--mh-fg)_12%,transparent)] pt-4">
          <span className="mr-1 text-[12px] text-[var(--mh-muted)]">Need more?</span>
          {(Object.keys(TOPUPS) as TopupKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={outlineBtn}
              disabled={busy !== null}
              onClick={() => void startCheckout({ kind: 'topup', topup: key }, `topup:${key}`)}
            >
              {busy === `topup:${key}` ? 'Opening…' : `+${TOPUPS[key].credits.toLocaleString()} credits · $${TOPUPS[key].priceUsd}`}
            </button>
          ))}
        </div>
      )}

      {billing.dodoCustomerId && (
        <div className="border-t border-[color-mix(in_srgb,var(--mh-fg)_12%,transparent)] pt-4">
          <button type="button" className={outlineBtn} disabled={busy !== null} onClick={() => void openPortal()}>
            {busy === 'portal' ? 'Opening…' : 'Manage billing'}
          </button>
        </div>
      )}
    </section>
  )
}
