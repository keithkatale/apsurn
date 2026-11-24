'use client'

import { ArrowRight, ExternalLink, Globe } from 'lucide-react'
import { useState } from 'react'
import type { CompetitorAnalysisResult } from '@/lib/types'

export function CompetitorsStep({
  companyName,
  data,
  onContinue,
  leadsReadyCount,
  leadsLoading,
}: {
  companyName: string
  data: CompetitorAnalysisResult
  onContinue: () => void
  leadsReadyCount: number
  leadsLoading: boolean
}) {
  const { positioningStrategy, competitors } = data
  const [failedScreenshots, setFailedScreenshots] = useState<Record<string, boolean>>({})

  return (
    <div className="flex flex-col gap-8">
      {/* Positioning Differentiation Strategy */}
      <section className="project-card rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--mh-muted)]">
              <span className="rounded-full border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] px-3 py-0.5 font-medium text-[var(--mh-fg)]">
                Positioning &amp; Differentiation
              </span>
              <span>· {positioningStrategy.categoryAnchor}</span>
            </div>
            <h2 className="font-display max-w-2xl text-[clamp(26px,3.4vw,40px)] font-medium leading-[1.1] tracking-tight text-[var(--mh-fg)]">
              {positioningStrategy.messagingHook}
            </h2>
          </div>

          <button
            type="button"
            onClick={onContinue}
            className="mh-focus inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-[var(--mh-fg)] px-5 text-[14px] font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90"
          >
            <span>
              {leadsReadyCount > 0
                ? `View ${leadsReadyCount} Leads`
                : leadsLoading
                  ? 'Continue to 50 Leads (Finding…)'
                  : 'Find 50 Leads'}
            </span>
            <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[10px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)] p-5">
            <p className="text-[12px] font-medium text-[var(--mh-muted)]">Why buyers leave the status quo</p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-[var(--mh-fg)]">{positioningStrategy.statusQuoProblem}</p>
          </div>
          <div className="rounded-[10px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] p-5">
            <p className="text-[12px] font-medium text-[var(--mh-fg)]">Your primary winning wedge</p>
            <p className="mt-1.5 text-[15px] font-medium leading-relaxed text-[var(--mh-fg)]">{positioningStrategy.primaryWedge}</p>
          </div>
        </div>

        {positioningStrategy.differentiationPillars.length > 0 && (
          <div className="mt-6">
            <p className="mb-3 text-[12px] font-medium text-[var(--mh-muted)]">
              Positioning comparison · Competitors vs. {companyName}
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {positioningStrategy.differentiationPillars.map((pillar) => (
                <div
                  key={pillar.title}
                  className="flex flex-col justify-between gap-3 rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-4"
                >
                  <div>
                    <p className="text-[14px] font-medium text-[var(--mh-fg)]">{pillar.title}</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-[var(--mh-muted)]">
                      <span className="font-medium text-[var(--mh-fg)]/70">Them: </span>
                      {pillar.them}
                    </p>
                  </div>
                  <div className="border-t border-[var(--mh-soft)] pt-2.5 text-[13px] leading-relaxed text-[var(--mh-fg)]">
                    <span className="font-medium">Us: </span>
                    {pillar.us}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Competitor Website UI Cards & Battlecards */}
      <section className="flex flex-col gap-4">
        <div>
          <h3 className="font-display text-[26px] font-medium tracking-tight text-[var(--mh-fg)]">
            Competitor Website UI &amp; Positioning
          </h3>
          <p className="mt-1 text-[14px] text-[var(--mh-muted)]">
            Live homepage messaging and website UI for {competitors.length} competitors in your space, paired with how {companyName} differentiates.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {competitors.map((comp) => {
            const screenshotFailed = failedScreenshots[comp.domain]
            return (
              <article
                key={comp.domain}
                className="project-card flex flex-col overflow-hidden rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-1.5"
              >
                {/* Browser Chrome Website UI Preview (Matching Landing Page ProductWindow) */}
                <div className="overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#111111] text-white">
                  <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-[#151515] px-4 py-2.5">
                    <div className="flex items-center gap-1.5" aria-hidden>
                      <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                      <span className="size-2.5 rounded-full bg-[#febc2e]" />
                      <span className="size-2.5 rounded-full bg-[#28c840]" />
                    </div>
                    <a
                      href={`https://${comp.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-md border border-white/10 bg-[#1a1a1a] px-3 py-0.5 text-[12px] text-[#9a9a9a] hover:text-white"
                    >
                      <Globe className="size-3" aria-hidden />
                      <span>{comp.domain}</span>
                      <ExternalLink className="size-2.5 opacity-70" aria-hidden />
                    </a>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-[#9a9a9a]">
                      {comp.categoryTag}
                    </span>
                  </div>

                  {/* Website Hero UI Preview */}
                  <div className="relative min-h-[200px] overflow-hidden bg-[#111111]">
                    {!screenshotFailed && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={comp.screenshotUrl}
                        alt={`${comp.name} website UI`}
                        className="absolute inset-0 h-full w-full object-cover object-top opacity-35 transition-opacity duration-300 hover:opacity-75"
                        loading="lazy"
                        onError={() => setFailedScreenshots((prev) => ({ ...prev, [comp.domain]: true }))}
                      />
                    )}
                    <div className="relative z-10 flex min-h-[200px] flex-col justify-between bg-gradient-to-t from-[#111111] via-[#111111]/85 to-transparent p-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={comp.faviconUrl}
                            alt=""
                            className="size-6 rounded bg-white/10 p-0.5"
                            onError={(e) => {
                              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                            }}
                          />
                          <span className="text-[15px] font-medium tracking-tight text-white">{comp.name}</span>
                        </div>
                        {comp.liveScraped && (
                          <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] text-neutral-200">
                            Live site scraped
                          </span>
                        )}
                      </div>

                      <div className="my-3 max-w-lg">
                        <p className="text-[11px] font-medium text-[#9a9a9a]">Homepage headline</p>
                        <h4 className="mt-1 line-clamp-2 text-[18px] font-medium leading-snug text-white">
                          &ldquo;{comp.heroHeadline}&rdquo;
                        </h4>
                        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[#b8b8b8]">
                          {comp.subheadline}
                        </p>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center rounded-full bg-white px-3.5 py-1 text-[12px] font-medium text-[#0a0a0a]">
                          {comp.ctaText || 'Get started'}
                        </span>
                        <a
                          href={`https://${comp.domain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[12px] text-[#9a9a9a] underline-offset-4 hover:text-white hover:underline"
                        >
                          Open live site →
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Differentiation & Battlecard Details */}
                <div className="flex flex-1 flex-col gap-3.5 p-5">
                  <div>
                    <p className="text-[12px] text-[var(--mh-muted)]">What they offer</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-[var(--mh-fg)]">{comp.overlap}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)] p-3.5">
                      <p className="text-[12px] font-medium text-[var(--mh-muted)]">Their blind spot</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-[var(--mh-fg)]">{comp.theirWeakness}</p>
                    </div>

                    <div className="rounded-2xl border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] p-3.5">
                      <p className="text-[12px] font-medium text-[var(--mh-fg)]">How we differentiate</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-[var(--mh-fg)]">{comp.howWeDifferentiate}</p>
                    </div>
                  </div>

                  <div className="mt-auto rounded-2xl border border-[var(--mh-soft)] p-3.5">
                    <p className="text-[12px] font-medium text-[var(--mh-fg)]">
                      Sales win play · When prospect mentions {comp.name}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--mh-muted)]">{comp.winPlay}</p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </div>
  )
}
