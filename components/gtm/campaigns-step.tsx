'use client'

import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ContactAvatar } from '@/components/prospects/ContactAvatar'
import type { GeneratedCampaign, ScoredPost } from '@/lib/types'

const ANGLE_LABELS: Record<GeneratedCampaign['angleType'], string> = {
  'pain-point': 'Pain-Point Wedge',
  'competitor-wedge': 'Competitor Displacement',
  'buying-trigger': 'Buying Trigger Event',
  'executive-value': 'Executive Give-First',
}

export function CampaignsStep({
  companyName,
  campaigns,
  leads,
}: {
  companyName: string
  campaigns: GeneratedCampaign[]
  leads: ScoredPost[]
}) {
  const router = useRouter()
  const [redirectingTo, setRedirectingTo] = useState<string | null>(null)
  const previewLeads = leads.filter((l) => l.lead?.email || l.lead?.fullName).slice(0, 50)

  useEffect(() => {
    try {
      localStorage.setItem(
        'apsurn_campaigns_cache',
        JSON.stringify({
          companyName,
          campaigns,
          leads: previewLeads,
          savedAt: new Date().toISOString(),
        }),
      )
    } catch {
      // ignore storage errors
    }
  }, [companyName, campaigns, previewLeads])

  useEffect(() => {
    if (!campaigns[0]?.id) return
    const timer = window.setTimeout(() => {
      setRedirectingTo(campaigns[0].id)
      router.push(`/campaigns/${encodeURIComponent(campaigns[0].id)}`)
    }, 3200)
    return () => window.clearTimeout(timer)
  }, [campaigns, router])

  const openCampaign = (id: string) => {
    setRedirectingTo(id)
    router.push(`/campaigns/${encodeURIComponent(id)}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="project-card flex flex-wrap items-center justify-between gap-4 rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-6 sm:p-8">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--mh-muted)]">
            <span className="rounded-full border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] px-3 py-0.5 font-medium text-[var(--mh-fg)]">
              Step 5 · Campaign Plans Saved
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-[var(--mh-fg)]" aria-hidden />
              {campaigns.length} campaign plans &amp; {previewLeads.length} leads saved
            </span>
          </div>
          <h2 className="font-display mt-1 text-[clamp(26px,3.4vw,40px)] font-medium leading-[1.1] tracking-tight text-[var(--mh-fg)]">
            Potential Campaigns for {companyName}
          </h2>
          <p className="text-[15px] text-[var(--mh-muted)]">
            {redirectingTo
              ? 'Opening your first campaign workspace…'
              : 'Select any campaign below to open the sending workspace, or wait a moment as we open your first campaign automatically.'}
          </p>
        </div>

        {campaigns[0] && (
          <button
            type="button"
            onClick={() => openCampaign(campaigns[0].id)}
            className="mh-focus inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-[var(--mh-fg)] px-5 text-[14px] font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90"
          >
            <span>Open First Campaign</span>
            <ArrowRight className="size-4" aria-hidden />
          </button>
        )}
      </header>

      {/* Full-Width Campaign Plans Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {campaigns.map((campaign, campIdx) => {
          const badgeLabel = ANGLE_LABELS[campaign.angleType] ?? ANGLE_LABELS['pain-point']
          const avatarSlice = previewLeads.slice(campIdx * 4, campIdx * 4 + 5)
          const displayAvatars = avatarSlice.length > 0 ? avatarSlice : previewLeads.slice(0, 5)

          return (
            <article
              key={campaign.id}
              onClick={() => openCampaign(campaign.id)}
              className="project-card group flex cursor-pointer flex-col justify-between gap-5 rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-6"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)] px-3 py-0.5 text-[11px] font-medium text-[var(--mh-fg)]">
                    {badgeLabel}
                  </span>

                  <div className="flex items-center gap-2">
                    {displayAvatars.length > 0 && (
                      <div className="flex -space-x-2">
                        {displayAvatars.map((item) => (
                          <ContactAvatar
                            key={item.id}
                            name={item.lead?.fullName}
                            linkedinUrl={item.lead?.linkedinUrl}
                            email={item.lead?.email}
                            className="size-6 rounded-full ring-2 ring-[var(--mh-bg)]"
                          />
                        ))}
                      </div>
                    )}
                    <span className="text-[12px] text-[var(--mh-muted)]">
                      {previewLeads.length || campaign.matchedLeadCount || 50} leads
                    </span>
                  </div>
                </div>

                <div>
                  <h3 className="text-[19px] font-medium tracking-tight text-[var(--mh-fg)]">
                    {campaign.name}
                  </h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-[color:color-mix(in_srgb,var(--mh-fg)_75%,transparent)]">
                    {campaign.positioningHook}
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--mh-muted)]">{campaign.whyItWorks}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-[var(--mh-soft)] pt-4">
                <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--mh-muted)]">
                  <span className="rounded-full border border-[var(--mh-soft)] px-2.5 py-0.5 text-[var(--mh-fg)]">
                    {campaign.targetPersona}
                  </span>
                  <span>·</span>
                  <span>{campaign.targetSegment}</span>
                </div>

                <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--mh-fg)] transition-transform group-hover:translate-x-0.5">
                  Open campaign
                  <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
