'use client'

import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { Suspense } from 'react'
import { BillingCard } from '@/components/billing/BillingCard'
import { InboxCard } from '@/components/gtm/inbox-card'

export default function SettingsPage() {
  return (
    <DashboardShell activeUrl="/settings">
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 sm:px-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Settings</h1>
          <p className="mt-1 text-sm text-neutral-600">Manage the account details campaigns send with.</p>
        </header>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Plan &amp; credits</h2>
            <p className="text-[13px] text-neutral-600">Credits power lead sourcing, enrichment, campaigns and AI drafts.</p>
          </div>
          <Suspense fallback={null}>
            <BillingCard />
          </Suspense>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Sending inbox</h2>
            <p className="text-[13px] text-neutral-600">
              Outreach is sent from this Gmail address. Connect it here or from the campaigns page.
            </p>
          </div>
          <InboxCard />
        </section>
      </div>
    </DashboardShell>
  )
}
