'use client'

import { Briefcase, Mail, Users, type LucideIcon } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { CompanyFavicon } from '@/components/prospects/CompanyFavicon'
import type { Report } from '@/lib/reports'
import { cn } from '@/lib/utils'

type TabId = 'business' | 'leads' | 'campaigns'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[12px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-5 sm:p-6">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-[var(--mh-muted)]">{title}</h2>
      {children}
    </section>
  )
}

function Chips({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-[var(--mh-muted)]">Not available</p>
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className="rounded-full bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] px-2.5 py-1 text-xs">
          {item}
        </li>
      ))}
    </ul>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-4 text-sm">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-medium text-[var(--mh-muted)]">{label}</h3>
      {children}
    </div>
  )
}

/** The company's logo (its site favicon) before its name. */
function Heading({ report }: { report: Report }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-[var(--mh-muted)]">Outbound plan</p>
      <div className="mt-2 flex items-center gap-3">
        <CompanyFavicon domain={report.company.websiteUrl} name={report.company.name} className="size-11" />
        <h1 className="font-display text-3xl font-normal sm:text-4xl">{report.company.name}</h1>
      </div>
      {report.profile?.oneLiner && <p className="mt-3 max-w-2xl text-base text-[var(--mh-muted)]">{report.profile.oneLiner}</p>}
      <p className="mt-2 text-xs text-[var(--mh-muted)]">
        Generated from {report.company.websiteUrl.replace(/^https?:\/\//, '')} on{' '}
        {new Date(report.createdAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  )
}

function IcpSection({ profile }: { profile: NonNullable<Report['profile']> }) {
  const icp = profile.icp
  return (
    <Section title="Ideal customer profile">
      <div className="space-y-5">
        <p className="text-base leading-relaxed">{icp.summary}</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Industries">
            <Chips items={icp.industries} />
          </Field>
          <Field label="Company size">
            <p className="text-sm">{icp.companySize}</p>
          </Field>
          <Field label="Buyer personas">
            <Chips items={icp.buyerPersonas} />
          </Field>
          <Field label="Geographies">
            <Chips items={icp.geographies} />
          </Field>
          <Field label="Pain points">
            <Bullets items={icp.painPoints} />
          </Field>
          <Field label="Buying triggers">
            <Bullets items={icp.buyingTriggers} />
          </Field>
        </div>
      </div>
    </Section>
  )
}

function BlueprintSection({ report }: { report: Report }) {
  const profile = report.profile!
  return (
    <Section title="Business blueprint">
      <div className="mb-5 flex items-center gap-3">
        <CompanyFavicon domain={report.company.websiteUrl} name={report.company.name} className="size-9" />
        <span className="text-lg font-medium">{report.company.name}</span>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Value proposition">
          <p className="text-sm">{profile.valueProposition}</p>
        </Field>
        <Field label="Category">
          <p className="text-sm">{profile.category}</p>
        </Field>
        <Field label="Business model">
          <p className="text-sm">
            {profile.businessModel.type} · {profile.businessModel.revenueModel} · {profile.businessModel.salesMotion}
          </p>
        </Field>
        <Field label="Key features">
          <Bullets items={profile.keyFeatures} />
        </Field>
      </div>
    </Section>
  )
}

function CompetitorsSection({ competitors }: { competitors: NonNullable<Report['competitors']> }) {
  return (
    <Section title="Competitors and positioning">
      <div className="mb-5 space-y-2 text-sm">
        <p>
          <span className="font-medium">Wedge:</span> {competitors.positioningStrategy.primaryWedge}
        </p>
        <p>
          <span className="font-medium">Hook:</span> {competitors.positioningStrategy.messagingHook}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {competitors.competitors.map((c) => (
          <article key={c.domain} className="rounded-[10px] border border-[var(--mh-soft)] p-4 text-sm">
            <h3 className="flex items-center gap-2 font-medium">
              <CompanyFavicon domain={c.domain} name={c.name} className="size-6" />
              <span>
                {c.name} <span className="font-normal text-[var(--mh-muted)]">· {c.categoryTag}</span>
              </span>
            </h3>
            <p className="mt-2 text-[var(--mh-muted)]">Their gap: {c.theirWeakness}</p>
            <p className="mt-2">How to win: {c.howWeDifferentiate}</p>
          </article>
        ))}
      </div>
    </Section>
  )
}

function LeadsSection({ report }: { report: Report }) {
  return (
    <Section title={`Target accounts (${report.leadTotal})`}>
      <p className="mb-4 text-xs text-[var(--mh-muted)]">
        Showing the top {report.leads.length} by ICP fit. Emails and phone numbers come with the list when you keep it in your account.
      </p>
      <ul className="divide-y divide-[var(--mh-soft)]">
        {report.leads.map((lead, i) => (
          <li key={`${lead.company}-${i}`} className="flex gap-3 py-3 text-sm">
            <CompanyFavicon domain={lead.website ?? lead.company} name={lead.company} className="mt-0.5 size-8" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{lead.company}</span>
                {lead.fit !== null && <span className="text-xs text-[var(--mh-muted)]">Fit {lead.fit}/100</span>}
              </div>
              <p className="text-xs text-[var(--mh-muted)]">
                {[lead.contactName, lead.contactTitle, lead.industry, lead.size, lead.location].filter(Boolean).join(' · ')}
              </p>
              {lead.reason && <p className="mt-1.5">{lead.reason}</p>}
              {lead.angle && <p className="mt-1 text-[var(--mh-muted)]">Angle: {lead.angle}</p>}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function CampaignsSection({ report }: { report: Report }) {
  return (
    <Section title="Outreach campaigns">
      <div className="space-y-8">
        {report.sequences.map((seq) => (
          <article key={seq.id}>
            <h3 className="text-base font-medium">{seq.name}</h3>
            <p className="text-xs text-[var(--mh-muted)]">
              {seq.persona} · {seq.segment}
            </p>
            {seq.hook && <p className="mt-2 text-sm">{seq.hook}</p>}
            {seq.why && <p className="mt-1 text-sm text-[var(--mh-muted)]">{seq.why}</p>}
            <ol className="mt-3 space-y-3">
              {seq.steps.map((step) => (
                <li key={step.order} className="rounded-[10px] border border-[var(--mh-soft)] p-4 text-sm">
                  <p className="text-xs text-[var(--mh-muted)]">{step.delayDays === 0 ? 'Day 1 · Initial outreach' : `Day ${step.delayDays} · Follow-up`}</p>
                  <p className="mt-1 font-medium">{step.subject}</p>
                  <p className="mt-2 whitespace-pre-line text-[var(--mh-muted)]">{step.body}</p>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </Section>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <Section title="Nothing here yet">
      <p className="text-sm text-[var(--mh-muted)]">{text}</p>
    </Section>
  )
}

function BusinessTab({ report }: { report: Report }) {
  return (
    <div className="flex flex-col gap-5">
      <Heading report={report} />
      {report.profile ? (
        <>
          <IcpSection profile={report.profile} />
          <BlueprintSection report={report} />
        </>
      ) : (
        <Empty text="No business profile was generated for this report." />
      )}
      {report.competitors && report.competitors.competitors.length > 0 && <CompetitorsSection competitors={report.competitors} />}
    </div>
  )
}

function LeadsTab({ report }: { report: Report }) {
  return report.leads.length ? <LeadsSection report={report} /> : <Empty text="No target accounts in this report." />
}

function CampaignsTab({ report }: { report: Report }) {
  return report.sequences.length ? <CampaignsSection report={report} /> : <Empty text="No campaigns in this report." />
}

function ClaimCard({ claimPath }: { claimPath: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-6 text-center">
      <h2 className="font-display text-xl font-normal">Want this list in your own account?</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-[var(--mh-muted)]">
        Create a free account and keep these accounts, contacts and email sequences, or start fresh with your own business.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={`/signup?next=${encodeURIComponent(claimPath)}`}
          className="inline-flex h-10 items-center rounded-[10px] bg-[var(--mh-fg)] px-5 text-sm font-medium text-[var(--mh-bg)]"
        >
          Create account
        </Link>
        <Link href={`/login?next=${encodeURIComponent(claimPath)}`} className="text-sm underline">
          I already have an account
        </Link>
      </div>
    </div>
  )
}

export function ReportView({ report, slug }: { report: Report; slug: string }) {
  const [tab, setTab] = useState<TabId>('business')
  const claimPath = `/r/${slug}/claim`
  const tabs: Array<{ id: TabId; label: string; icon: LucideIcon; count?: number }> = [
    { id: 'business', label: 'Business & ICP', icon: Briefcase },
    { id: 'leads', label: 'Leads', icon: Users, count: report.leadTotal },
    { id: 'campaigns', label: 'Campaigns', icon: Mail, count: report.sequences.length },
  ]

  return (
    <div className="marketing-home min-h-dvh bg-[var(--mh-bg)] text-[var(--mh-fg)]">
      {/* Mobile: one scrolling page */}
      <div className="md:hidden">
        <header className="border-b border-[var(--mh-soft)]">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="font-display text-lg">
              apsurn
            </Link>
            <div className="flex items-center gap-3 text-xs">
              <Link href={`/login?next=${encodeURIComponent(claimPath)}`} className="text-[var(--mh-muted)]">
                Sign in
              </Link>
              <Link href={`/signup?next=${encodeURIComponent(claimPath)}`} className="rounded-[8px] bg-[var(--mh-fg)] px-3 py-1.5 font-medium text-[var(--mh-bg)]">
                Keep this list
              </Link>
            </div>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-8">
          <Heading report={report} />
          {report.profile && (
            <>
              <IcpSection profile={report.profile} />
              <BlueprintSection report={report} />
            </>
          )}
          {report.competitors && report.competitors.competitors.length > 0 && <CompetitorsSection competitors={report.competitors} />}
          {report.leads.length > 0 && <LeadsSection report={report} />}
          {report.sequences.length > 0 && <CampaignsSection report={report} />}
          <ClaimCard claimPath={claimPath} />
        </main>
      </div>

      {/* Desktop: workspace with tabs, like the dashboard */}
      <div className="hidden min-h-dvh md:flex">
        <aside className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col justify-between border-r border-[var(--mh-soft)] bg-[var(--mh-bg)] px-3 py-4">
          <div className="flex flex-col gap-6">
            <Link href="/" className="flex items-center gap-3 px-1.5 py-1">
              <Image src="/branding/apsurn-gtm.png" alt="apsurn" width={28} height={28} className="size-7 rounded-[7px]" />
              <span className="text-[16px] font-medium tracking-[-0.03em]">apsurn</span>
            </Link>
            <div className="flex items-center gap-2.5 rounded-[8px] border border-[var(--mh-soft)] px-2.5 py-2">
              <CompanyFavicon domain={report.company.websiteUrl} name={report.company.name} className="size-8" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium">{report.company.name}</p>
                <p className="truncate font-mono text-[11px] text-[var(--mh-muted)]">
                  {report.company.websiteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]}
                </p>
              </div>
            </div>
            <nav className="flex flex-col gap-1" aria-label="Report sections">
              {tabs.map((t) => {
                const Icon = t.icon
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-10 w-full items-center gap-3 rounded-[6px] px-2.5 text-left text-[13px] font-medium transition-colors',
                      active
                        ? 'bg-[var(--mh-fg)] text-[var(--mh-bg)]'
                        : 'text-[var(--mh-muted)] hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] hover:text-[var(--mh-fg)]',
                    )}
                  >
                    <Icon className="size-[18px] shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{t.label}</span>
                    {t.count !== undefined && t.count > 0 && <span className="text-[11px] opacity-70">{t.count}</span>}
                  </button>
                )
              })}
            </nav>
          </div>

          <div className="flex flex-col gap-2 px-1">
            <p className="text-xs text-[var(--mh-muted)]">Want this list in your own account?</p>
            <Link
              href={`/signup?next=${encodeURIComponent(claimPath)}`}
              className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[var(--mh-fg)] text-sm font-medium text-[var(--mh-bg)]"
            >
              Keep this list
            </Link>
            <Link href={`/login?next=${encodeURIComponent(claimPath)}`} className="text-center text-xs text-[var(--mh-muted)] underline">
              I already have an account
            </Link>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-8 py-8">
            {tab === 'business' && <BusinessTab report={report} />}
            {tab === 'leads' && <LeadsTab report={report} />}
            {tab === 'campaigns' && <CampaignsTab report={report} />}
          </div>
        </main>
      </div>
    </div>
  )
}
