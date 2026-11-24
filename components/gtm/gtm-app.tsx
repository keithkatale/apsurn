'use client'

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import useSWRMutation from 'swr/mutation'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { Skeleton } from '@/components/ui/skeleton'
import { postJson } from '@/lib/post-json'
import { createClient } from '@/lib/supabase/client'
import type {
  AnalyzeResponse,
  BusinessProfile as ProfileType,
  CampaignsResponse,
  CompetitorAnalysisResult,
  GeneratedCampaign,
  ListenResponse,
  SeniorityId,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { BusinessProfile } from './business-profile'
import { CampaignsStep } from './campaigns-step'
import { CompetitorsStep } from './competitors-step'
import { LeadsTable } from './leads-table'
import { UrlForm } from './url-form'

const AUTO_ADVANCE_MS = 3000

const WIZARD_STEPS = [
  { id: 1, label: 'Scan website' },
  { id: 2, label: 'Business blueprint' },
  { id: 3, label: 'Competitors & positioning' },
  { id: 4, label: '50 leads' },
  { id: 5, label: 'Campaigns' },
] as const

type WizardStepId = (typeof WIZARD_STEPS)[number]['id']

export function GtmApp() {
  const searchParams = useSearchParams()
  const initialUrl = searchParams.get('url')
  const autoTriggered = useRef(false)
  // Guided run: after a fresh scan, each finished step shows for AUTO_ADVANCE_MS and then the next one opens.
  const [autoRun, setAutoRun] = useState(false)

  const [step, setStep] = useState<WizardStepId>(1)
  const [maxReachedStep, setMaxReachedStep] = useState<WizardStepId>(1)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  const [companyId, setCompanyId] = useState<string | undefined>(undefined)
  const [siteUrl, setSiteUrl] = useState<string>('')
  const [pagesRead, setPagesRead] = useState<string[]>([])
  const [profile, setProfile] = useState<ProfileType | null>(null)
  const [competitorData, setCompetitorData] = useState<CompetitorAnalysisResult | null>(null)
  const [leadsData, setLeadsData] = useState<ListenResponse | null>(null)
  const [campaignsData, setCampaignsData] = useState<GeneratedCampaign[] | null>(null)

  const [personTitle, setPersonTitle] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [personCountry, setPersonCountry] = useState<string[]>(['United States'])
  const [seniority] = useState<SeniorityId[]>(['founder', 'c_suite', 'vp', 'head', 'director'])

  const unlockStep = (target: WizardStepId, jump = true) => {
    if (jump) setStep(target)
    setMaxReachedStep((prev) => (target > prev ? target : prev))
  }

  const competitorsMutation = useSWRMutation(
    '/api/setup/competitors',
    postJson<CompetitorAnalysisResult>,
    {
      onSuccess: (data) => {
        setCompetitorData(data)
      },
    },
  )

  const leadsMutation = useSWRMutation('/api/setup/leads', postJson<ListenResponse>, {
    onSuccess: (data) => {
      setLeadsData(data)
      try {
        localStorage.setItem('apsurn_setup_leads_cache', JSON.stringify(data))
      } catch {
        // ignore storage quota errors
      }
    },
  })

  const campaignsMutation = useSWRMutation('/api/setup/campaigns', postJson<CampaignsResponse>, {
    onSuccess: (data) => {
      setCampaignsData(data.campaigns)
    },
  })

  const analyzeMutation = useSWRMutation('/api/analyze', postJson<AnalyzeResponse>, {
    onSuccess: (data) => {
      setCompanyId(data.companyId)
      setSiteUrl(data.url)
      setPagesRead(data.pagesRead)
      setProfile(data.profile)

      const titles = data.profile.icp.buyerPersonas.slice(0, 10)
      const kws = [
        ...new Set([...data.profile.icp.industries.slice(0, 4), ...data.profile.keywords.slice(0, 6)]),
      ].slice(0, 10)
      const geos = data.profile.icp.geographies.filter(Boolean)
      const countries = geos.length > 0 ? geos.slice(0, 5) : ['United States']

      setPersonTitle(titles)
      setKeywords(kws)
      setPersonCountry(countries)

      setCompetitorData(null)
      setLeadsData(null)
      setCampaignsData(null)
      unlockStep(2, true)

      competitorsMutation
        .trigger({ url: data.url, companyId: data.companyId, profile: data.profile })
        .then((compRes) => {
          campaignsMutation
            .trigger({
              companyId: data.companyId,
              profile: data.profile,
              positioning: compRes?.positioningStrategy ?? null,
              competitors: compRes?.competitors.map((c) => c.name) ?? data.profile.competitors,
              leadsCount: 50,
            })
            .catch(() => {})
        })
        .catch(() => {})

      leadsMutation
        .trigger({
          companyId: data.companyId,
          profile: data.profile,
          personTitle: titles,
          keywords: kws,
          personCountry: countries,
          seniority: ['founder', 'c_suite', 'vp', 'head', 'director'],
        })
        .catch(() => {})
    },
  })

  const runAnalyze = async (url: string) => {
    setStep(1)
    setAutoRun(true)
    // Drop anything left over from an earlier scan so the new run replaces it.
    try {
      localStorage.removeItem('apsurn_setup_leads_cache')
    } catch {
      // ignore
    }
    await fetch('/api/auth/guest', { method: 'POST' }).catch(() => null)
    analyzeMutation.trigger({ url }).catch(() => {})
  }

  const runCompetitors = () => {
    if (!profile) return
    unlockStep(3, true)
    if (!competitorData && !competitorsMutation.isMutating) {
      competitorsMutation.trigger({ url: siteUrl, companyId, profile }).catch(() => {})
    }
  }

  const runLeads = (force = false) => {
    if (!profile) return
    unlockStep(4, true)
    if (!force) {
      if (leadsData?.posts?.length || leadsMutation.isMutating) {
        return
      }
      try {
        const cachedRaw = localStorage.getItem('apsurn_setup_leads_cache')
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw) as ListenResponse
          if (Array.isArray(parsed?.posts) && parsed.posts.length > 0) {
            setLeadsData(parsed)
            return
          }
        }
      } catch {
        // ignore
      }
    }
    leadsMutation
      .trigger({
        companyId,
        profile,
        personTitle,
        keywords,
        personCountry,
        seniority,
      })
      .catch(() => {})
  }

  const runCampaigns = (force = false) => {
    if (!profile) return
    unlockStep(5, true)
    if (force || (!campaignsData && !campaignsMutation.isMutating)) {
      campaignsMutation
        .trigger({
          companyId,
          profile,
          positioning: competitorData?.positioningStrategy ?? null,
          competitors: competitorData?.competitors.map((c) => c.name) ?? profile.competitors,
          leadsCount: leadsData?.posts.length || 50,
        })
        .catch(() => {})
    }
  }

  const handleStepSelect = (targetStep: number) => {
    setAutoRun(false)
    const s = targetStep as WizardStepId
    if (!profile && s > 1) {
      setStep(1)
      return
    }
    if (s === 3 && !competitorData && !competitorsMutation.isMutating) {
      runCompetitors()
    } else if (s === 4 && !leadsData && !leadsMutation.isMutating) {
      runLeads()
    } else if (s === 5 && !campaignsData && !campaignsMutation.isMutating) {
      runCampaigns()
    } else {
      setStep(s)
    }
  }

  useEffect(() => {
    if (autoTriggered.current) return
    autoTriggered.current = true

    if (initialUrl) {
      void runAnalyze(initialUrl)
      return
    }

    // Setup always starts fresh: nothing from a previous scan is restored. We only prefill the
    // website already on the account so it can be edited and re-scanned (the new scan replaces the old one).
    fetch('/api/setup/state')
      .then((res) => (res.ok ? res.json() : null))
      .then((saved) => {
        const savedUrl = saved?.company?.website_url
        if (typeof savedUrl === 'string' && savedUrl) setSiteUrl((current) => current || savedUrl)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl])

  // Whether the step on screen has finished loading (the only thing that should start/restart the countdown).
  const stepReady =
    step === 2
      ? Boolean(profile)
      : step === 3
        ? Boolean(competitorData)
        : step === 4
          ? Boolean(leadsData?.posts.length)
          : false

  useEffect(() => {
    if (!autoRun) return
    if (!stepReady) return
    const timer = window.setTimeout(() => {
      if (step === 2) runCompetitors()
      else if (step === 3) runLeads()
      else if (step === 4) runCampaigns()
    }, AUTO_ADVANCE_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, step, stepReady])

  useEffect(() => {
    try {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data }) => {
        if (data.user?.email && !data.user.email.endsWith('@guest.apsurn.com')) {
          setUserEmail(data.user.email)
        }
      })
    } catch {
      // ignore
    }
  }, [])

  return (
    <DashboardShell activeUrl={siteUrl} activeStep={step} onStepSelect={handleStepSelect}>
      {/* Minimalist Inline Step Indicators (No cards, no horizontal lines above or below) */}
      <div className="mx-auto w-full max-w-7xl px-4 pt-5 pb-1 md:px-6">
        <nav aria-label="Setup steps" className="py-1">
          <ol className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 sm:gap-x-8">
            {WIZARD_STEPS.map((s) => {
              const isCurrent = step === s.id
              const isUnlocked =
                s.id <= maxReachedStep ||
                (s.id === 2 && Boolean(profile)) ||
                (s.id === 3 && Boolean(competitorData || competitorsMutation.isMutating)) ||
                (s.id === 4 && Boolean(leadsData || leadsMutation.isMutating)) ||
                (s.id === 5 && Boolean(campaignsData || campaignsMutation.isMutating))

              const isDone =
                (s.id === 1 && Boolean(profile)) ||
                (s.id === 2 && Boolean(profile) && step > 2) ||
                (s.id === 3 && Boolean(competitorData)) ||
                (s.id === 4 && Boolean(leadsData?.posts.length)) ||
                (s.id === 5 && Boolean(campaignsData?.length))

              const isWorking =
                (s.id === 1 && analyzeMutation.isMutating) ||
                (s.id === 3 && competitorsMutation.isMutating) ||
                (s.id === 4 && leadsMutation.isMutating) ||
                (s.id === 5 && campaignsMutation.isMutating)

              return (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={!isUnlocked}
                    onClick={() => handleStepSelect(s.id)}
                    className={cn(
                      'group inline-flex items-center gap-2 py-1 text-left transition-opacity',
                      isCurrent
                        ? 'text-[var(--mh-fg)]'
                        : isUnlocked
                          ? 'text-[var(--mh-muted)] hover:text-[var(--mh-fg)]'
                          : 'cursor-not-allowed text-[var(--mh-muted)]/40',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold transition-colors',
                        isCurrent
                          ? 'bg-[var(--mh-fg)] text-[var(--mh-bg)]'
                          : isDone
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] text-[var(--mh-muted)]',
                      )}
                    >
                      {isWorking ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                      ) : isDone && !isCurrent ? (
                        <Check className="size-3" strokeWidth={2.5} aria-hidden />
                      ) : (
                        s.id
                      )}
                    </span>
                    <span className={cn('text-xs tracking-tight sm:text-sm', isCurrent ? 'font-semibold' : 'font-medium')}>
                      {s.label}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>
      </div>

      <main
        className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8"
        onKeyDownCapture={(event) => {
          // Typing into a field means the person is editing: stop auto-advancing. Plain clicks/scrolling don't.
          const el = event.target as HTMLElement
          if (el.closest('input, textarea, select, [contenteditable="true"]')) setAutoRun(false)
        }}
      >
        {/* ================================================================ */}
        {/* STEP 1: Enter Website URL for AI Scan                            */}
        {/* ================================================================ */}
        {step === 1 && (
          <section className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-12 text-center md:py-20">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)] px-3.5 py-1 font-mono text-xs text-[var(--mh-muted)]">
              <Sparkles className="size-3.5 text-[var(--mh-fg)]" aria-hidden />
              Step 1 · AI Website Scanner
            </span>
            <h1 className="font-display text-4xl font-normal tracking-[-0.03em] text-balance text-[var(--mh-fg)] md:text-5xl">
              Enter your website URL to build your <span className="italic">GTM engine.</span>
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-[var(--mh-muted)] text-pretty">
              We scan your live pages in seconds, generate your business blueprint, map your competitors&apos; website UI &amp; positioning, find 50 verified leads via Apify, and create your outbound campaigns.
            </p>

            <div className="w-full">
              <UrlForm key={siteUrl} onSubmit={runAnalyze} loading={analyzeMutation.isMutating} defaultValue={siteUrl} />
            </div>

            {analyzeMutation.isMutating && (
              <div className="project-card w-full max-w-md rounded-[10px] p-5 text-left">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase tracking-wider text-[var(--mh-muted)]">Scanning website</span>
                  <Loader2 className="size-4 animate-spin text-[var(--mh-fg)]" aria-hidden />
                </div>
                <p className="mt-1.5 text-sm font-medium text-[var(--mh-fg)]">
                  Extracting business model, ICP &amp; buyer personas…
                </p>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--mh-fg)_10%,transparent)]">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--mh-fg)]" />
                </div>
              </div>
            )}

            {analyzeMutation.error && <ErrorNote message={analyzeMutation.error.message} />}

            {profile && !analyzeMutation.isMutating && (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--mh-soft)] px-5 text-sm font-medium text-[var(--mh-fg)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)]"
              >
                <span>View {profile.companyName} Blueprint</span>
                <ArrowRight className="size-4" aria-hidden />
              </button>
            )}
          </section>
        )}

        {/* ================================================================ */}
        {/* STEP 2: Generated Business Blueprint                             */}
        {/* ================================================================ */}
        {step === 2 && profile && (
          <div className="flex flex-col gap-6">
            <BusinessProfile profile={profile} url={siteUrl} pagesRead={pagesRead} />

            <div className="flex items-center justify-between pt-4">
              <button
                type="button"
                onClick={() => {
                  setAutoRun(false)
                  setStep(1)
                }}
                className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-[var(--mh-muted)] transition-colors hover:text-[var(--mh-fg)]"
              >
                <ArrowLeft className="size-4" aria-hidden />
                <span>Change website</span>
              </button>
              <button
                type="button"
                onClick={runCompetitors}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--mh-fg)] px-6 text-sm font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90"
              >
                <span>Continue to Competitors &amp; Positioning</span>
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 3: Competitor Website UI & Positioning Differentiation      */}
        {/* ================================================================ */}
        {step === 3 && profile && (
          <div className="flex flex-col gap-6">
            {competitorsMutation.isMutating && !competitorData && (
              <div className="project-card mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-[10px] p-8 text-center">
                <Loader2 className="size-7 animate-spin text-[var(--mh-fg)]" aria-hidden />
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-[var(--mh-muted)]">
                    Step 3 · Competitive Intelligence
                  </p>
                  <h2 className="font-display mt-1 text-xl font-normal text-[var(--mh-fg)]">
                    Scanning competitor websites &amp; positioning…
                  </h2>
                  <p className="mt-1 text-sm text-[var(--mh-muted)]">
                    Extracting live hero messaging and differentiation wedges against{' '}
                    {profile.competitors.slice(0, 4).join(', ')}.
                  </p>
                </div>
              </div>
            )}

            {competitorsMutation.error && !competitorData && (
              <div className="flex flex-col items-center gap-3">
                <ErrorNote message={competitorsMutation.error.message} />
                <button
                  type="button"
                  onClick={() => competitorsMutation.trigger({ url: siteUrl, companyId, profile })}
                  className="inline-flex h-10 items-center rounded-full bg-[var(--mh-fg)] px-5 text-sm font-medium text-[var(--mh-bg)]"
                >
                  Retry Competitor Analysis
                </button>
              </div>
            )}

            {competitorData && (
              <>
                <CompetitorsStep
                  companyName={profile.companyName}
                  data={competitorData}
                  onContinue={() => runLeads(false)}
                  leadsReadyCount={leadsData?.posts.length ?? 0}
                  leadsLoading={leadsMutation.isMutating}
                />
                <div className="flex items-center justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-[var(--mh-muted)] transition-colors hover:text-[var(--mh-fg)]"
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                    <span>Back to Blueprint</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => runLeads(false)}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--mh-fg)] px-6 text-sm font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90"
                  >
                    <span>
                      {leadsData?.posts.length
                        ? `View ${leadsData.posts.length} Leads`
                        : 'Continue to 50 Leads'}
                    </span>
                    <ArrowRight className="size-4" aria-hidden />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 4: 50 Leads / Accounts Table (Full-Width, No Right Panel)   */}
        {/* ================================================================ */}
        {step === 4 && profile && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-normal tracking-[-0.025em] text-[var(--mh-fg)] md:text-3xl">
                  {leadsData ? `${leadsData.posts.length} Verified Leads & Accounts` : 'Finding 50 Verified Leads'}
                </h2>
                <p className="mt-1 text-sm text-[var(--mh-muted)]">
                  {leadsData
                    ? `Sourced via Apify for ${profile.companyName} and scored for ICP fit.`
                    : `Running Apify lead extraction for ${personTitle.slice(0, 3).join(', ') || 'decision-makers'}…`}
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                {leadsData && (
                  <button
                    type="button"
                    className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--mh-soft)] px-4 text-xs font-medium text-[var(--mh-fg)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] disabled:opacity-50"
                    onClick={() => runLeads(true)}
                    disabled={leadsMutation.isMutating}
                  >
                    <RotateCcw className={cn('size-3.5', leadsMutation.isMutating && 'animate-spin')} aria-hidden />
                    <span>Refresh Leads</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => runCampaigns(false)}
                  disabled={leadsMutation.isMutating && !leadsData}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--mh-fg)] px-5 text-sm font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <span>
                    {campaignsData
                      ? `View ${campaignsData.length} Campaigns`
                      : 'Continue to Campaigns'}
                  </span>
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              </div>
            </div>

            {leadsMutation.isMutating && !leadsData && (
              <div className="project-card flex flex-col gap-3 rounded-[10px] p-6">
                <div className="flex items-center gap-3">
                  <Loader2 className="size-5 animate-spin text-[var(--mh-fg)]" aria-hidden />
                  <p className="text-sm font-medium text-[var(--mh-fg)]">
                    Extracting 50 verified leads via Apify &amp; scoring fit…
                  </p>
                </div>
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            )}

            {leadsMutation.error && !leadsMutation.isMutating && (
              <ErrorNote message={leadsMutation.error.message} />
            )}

            {leadsData && <LeadsTable data={leadsData} />}

            {leadsData && (
              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-[var(--mh-muted)] transition-colors hover:text-[var(--mh-fg)]"
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  <span>Back to Competitors</span>
                </button>
                <button
                  type="button"
                  onClick={() => runCampaigns(false)}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-[var(--mh-fg)] px-6 text-sm font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90"
                >
                  <Sparkles className="size-4" aria-hidden />
                  <span>Continue to Potential Campaigns</span>
                  <ArrowRight className="size-4" aria-hidden />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* STEP 5: Potential Outbound Campaigns                             */}
        {/* ================================================================ */}
        {step === 5 && profile && (
          <div className="flex flex-col gap-6">
            {campaignsMutation.isMutating && !campaignsData && (
              <div className="project-card mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-[10px] p-8 text-center">
                <Loader2 className="size-7 animate-spin text-[var(--mh-fg)]" aria-hidden />
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-[var(--mh-muted)]">
                    Step 5 · Campaign Architect
                  </p>
                  <h2 className="font-display mt-1 text-xl font-normal text-[var(--mh-fg)]">
                    Writing personalized multi-step outbound campaigns…
                  </h2>
                  <p className="mt-1 text-sm text-[var(--mh-muted)]">
                    Combining your Blueprint, Positioning Wedges, and 50 Leads into 4 ready-to-send sequences.
                  </p>
                </div>
              </div>
            )}

            {campaignsMutation.error && !campaignsData && (
              <div className="flex flex-col items-center gap-3">
                <ErrorNote message={campaignsMutation.error.message} />
                <button
                  type="button"
                  onClick={() => runCampaigns(true)}
                  className="inline-flex h-10 items-center rounded-full bg-[var(--mh-fg)] px-5 text-sm font-medium text-[var(--mh-bg)]"
                >
                  Retry Campaign Generation
                </button>
              </div>
            )}

            {campaignsData && (
              <>
                <CampaignsStep
                  companyName={profile.companyName}
                  campaigns={campaignsData}
                  leads={leadsData?.posts ?? []}
                />
                <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-[var(--mh-muted)] transition-colors hover:text-[var(--mh-fg)]"
                  >
                    <ArrowLeft className="size-4" aria-hidden />
                    <span>Back to 50 Leads</span>
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => runCampaigns(true)}
                      disabled={campaignsMutation.isMutating}
                      className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--mh-soft)] px-4 text-xs font-medium text-[var(--mh-fg)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] disabled:opacity-50"
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                      <span>Regenerate Campaigns</span>
                    </button>
                    {!userEmail && (
                      <Link
                        href="/signup?next=/setup&from=setup"
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--mh-fg)] px-5 text-xs font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90"
                      >
                        <CheckCircle2 className="size-4" aria-hidden />
                        <span>Create Account to Save Workspace</span>
                      </Link>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </DashboardShell>
  )
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" className="flex w-full items-start gap-2 rounded-2xl bg-destructive/10 p-3.5 text-left text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  )
}
