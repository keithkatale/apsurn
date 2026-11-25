'use client'

import {
  Check,
  ChevronLeft,
  Clock3,
  Gift,
  Loader2,
  Mail,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { MergeFieldText } from '@/components/campaigns/MergeFieldText'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { CompanyFavicon } from '@/components/prospects/CompanyFavicon'
import { ContactAvatar } from '@/components/prospects/ContactAvatar'
import { useUnlockFlow } from '@/lib/billing/use-unlock'
import { ConnectGoogleModal } from '@/components/inbox/ConnectGoogleModal'
import {
  MERGE_FIELD_KEYS,
  MERGE_FIELD_LABELS,
  resolveMergeFields,
  tokenizeLeadMentions,
} from '@/lib/outreach/merge-fields'
import { cn } from '@/lib/utils'

type CampaignLead = {
  id: string
  fullName: string | null
  title: string | null
  email: string | null
  phone?: string | null
  linkedinUrl: string | null
  companyName: string
  companyDomain: string
  industry?: string | null
  outreachAngle?: string | null
}

type CampaignStep = {
  id: string
  stepOrder: number
  delayDays: number
  subject: string
  body: string
}

type CampaignData = {
  id: string
  name: string
  status: string
  description: string
  pain: string
  targeting: string
  angleType: string
  leadCount: number
  steps: CampaignStep[]
}

const DEFAULT_OPENER_BODY = `Hi {{first_name}} ,

For a {{title}} at a growing company like {{company}} , scaling beyond early traction means finding new buyers consistently, often without adding a full internal team.

We handle that entire process for B2B SaaS companies, delivering qualified meetings each month without you needing to manage tools or SDRs.

Is this something on your radar at {{company}} , or am I off base?

Best,
Keith`

function CampaignSendingWorkspace() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const campaignId = decodeURIComponent(params.id || '')

  const [loading, setLoading] = useState(true)
  const [senderCompanyName, setSenderCompanyName] = useState('Apsurn')
  const [campaign, setCampaign] = useState<CampaignData | null>(null)
  const [leads, setLeads] = useState<CampaignLead[]>([])
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({})
  const [subject, setSubject] = useState('scaling new buyers')
  const [body, setBody] = useState(DEFAULT_OPENER_BODY)
  const [rewriting, setRewriting] = useState(false)
  const [writingProgress, setWritingProgress] = useState<{ current: number; total: number } | null>(null)
  const [followups, setFollowups] = useState<CampaignStep[]>([])
  const [addDelayDays, setAddDelayDays] = useState(3)

  // Modals & Sending state
  const [connectOpen, setConnectOpen] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [sendStatus, setSendStatus] = useState<string | null>(null)
  const [sendingAll, setSendingAll] = useState(false)
  const [sendingOne, setSendingOne] = useState(false)
  const [sentLeadIds, setSentLeadIds] = useState<Set<string>>(() => new Set())
  const [addPersonOpen, setAddPersonOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newCompany, setNewCompany] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [peopleFilter, setPeopleFilter] = useState('')

  const unlock = useUnlockFlow(`/campaigns/${encodeURIComponent(campaignId)}`)
  const unlockPulse = 'animate-pulse shadow-[0_0_0_4px_color-mix(in_srgb,var(--mh-fg)_18%,transparent)]'

  const autoWriteStarted = useRef(false)

  // Load campaign, leads, and drafts from Supabase (/api/campaigns) with localStorage fallback
  useEffect(() => {
    let mounted = true
    // Real inbox connection (not a local flag): the send buttons ask to connect Gmail until one exists.
    fetch('/api/inboxes/smtp', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (mounted) setConnectedEmail(data?.inboxes?.[0]?.email_address ?? null)
      })
      .catch(() => {})

    fetch('/api/campaigns')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted) return
        let allCampaigns: CampaignData[] = data?.campaigns ?? []
        let allLeads: CampaignLead[] = data?.leads ?? []
        let sender = data?.companyName || 'Apsurn'
        const dbDrafts = (data?.drafts ?? {}) as Record<string, { subject: string; body: string }>

        try {
          const raw = localStorage.getItem('apsurn_campaigns_cache')
          if (raw) {
            const cached = JSON.parse(raw)
            if (cached?.companyName && sender === 'Apsurn') sender = cached.companyName
            if (allCampaigns.length === 0 && Array.isArray(cached?.campaigns)) {
              allCampaigns = cached.campaigns.map((c: Record<string, unknown>, i: number) => ({
                id: String(c.id || `campaign-${i + 1}`),
                name: String(c.name || 'Outbound Campaign'),
                status: 'active',
                description: String(c.positioningHook || c.whyItWorks || ''),
                pain: String(c.whyItWorks || ''),
                targeting: `${c.targetPersona || 'Founder'} · ${c.targetSegment || 'ICP'}`,
                angleType: String(c.angleType || 'pain-point'),
                leadCount: 50,
                steps: Array.isArray(c.sequence)
                  ? c.sequence.map((s: Record<string, unknown>, idx: number) => ({
                      id: `step-${idx + 1}`,
                      stepOrder: Number(s.stepNumber ?? idx + 1),
                      delayDays: Number(s.delayDays ?? 0),
                      subject: String(s.subject ?? 'scaling new buyers'),
                      body: String(s.body ?? DEFAULT_OPENER_BODY),
                    }))
                  : [],
              }))
            }
            if (allLeads.length === 0 && Array.isArray(cached?.leads)) {
              allLeads = cached.leads.map((p: Record<string, unknown>, idx: number) => {
                const l = (p.lead as Record<string, unknown>) || {}
                const website = String(l.companyWebsite || '')
                const domain =
                  website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] ||
                  (typeof l.email === 'string' ? l.email.split('@')[1] : '') ||
                  ''
                return {
                  id: String(p.id || `lead-${idx}`),
                  fullName: String(l.fullName || p.author || 'Unknown'),
                  title: String(l.jobTitle || 'Co-Founder'),
                  email: typeof l.email === 'string' ? l.email : null,
                  phone: typeof l.phone === 'string' ? l.phone : null,
                  linkedinUrl: typeof l.linkedinUrl === 'string' ? l.linkedinUrl : null,
                  companyName: String(l.companyName || p.community || 'Company'),
                  companyDomain: domain,
                  industry: typeof l.companyIndustry === 'string' ? l.companyIndustry : null,
                  outreachAngle: typeof p.outreachAngle === 'string' ? p.outreachAngle : null,
                }
              })
            }
          }
        } catch {
          // ignore
        }

        const matchedCampaign =
          allCampaigns.find((c) => c.id === campaignId) ??
          allCampaigns[0] ?? {
            id: campaignId,
            name: 'Free Trial Users of Competitor Landing Page Tools',
            status: 'active',
            description:
              'Send personalized ICP audits (showing discrepancies between their website positioning and real market fit) to founders and decision-makers.',
            pain: '',
            targeting: 'Founders & Decision Makers',
            angleType: 'competitor-wedge',
            leadCount: allLeads.length,
            steps: [
              {
                id: 'step-1',
                stepOrder: 1,
                delayDays: 0,
                subject: 'scaling new buyers',
                body: DEFAULT_OPENER_BODY,
              },
            ],
          }

        setSenderCompanyName(sender)
        setCampaign(matchedCampaign)
        setLeads(allLeads)
        setDrafts(dbDrafts)
        if (allLeads[0]?.id) setSelectedLeadId(allLeads[0].id)
        if (matchedCampaign.steps.length > 1) {
          setFollowups(matchedCampaign.steps.slice(1))
        }
        setLoading(false)
      })
      .catch(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [campaignId])

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? leads[0] ?? null,
    [leads, selectedLeadId],
  )

  const filteredLeads = useMemo(() => {
    const q = peopleFilter.trim().toLowerCase()
    if (!q) return leads
    return leads.filter((l) =>
      [l.fullName, l.title, l.companyName, l.email].some((v) => v?.toLowerCase().includes(q)),
    )
  }, [leads, peopleFilter])

  // Sync subject & body when switching selected lead
  useEffect(() => {
    if (!selectedLead || !campaign) return
    const key = `${selectedLead.id}:${campaign.id}`
    const existing = drafts[key]
    if (existing) {
      setSubject(existing.subject)
      setBody(existing.body)
      return
    }
    const step1 = campaign.steps[0]
    const rawSubj = step1?.subject || 'scaling new buyers'
    const rawBody = step1?.body || DEFAULT_OPENER_BODY
    setSubject(tokenizeLeadMentions(rawSubj, selectedLead))
    setBody(tokenizeLeadMentions(rawBody, selectedLead))
  }, [selectedLead, campaign, drafts])

  // Simulate/run background personalized email writing indicator for top 12 leads
  useEffect(() => {
    if (!campaign || leads.length === 0 || autoWriteStarted.current) return
    autoWriteStarted.current = true
    const total = Math.min(12, leads.length)
    setWritingProgress({ current: 1, total })
    const interval = window.setInterval(() => {
      setWritingProgress((prev) => {
        if (!prev) return null
        if (prev.current >= prev.total) {
          window.clearInterval(interval)
          return null
        }
        return { ...prev, current: prev.current + 1 }
      })
    }, 900)
    return () => window.clearInterval(interval)
  }, [campaign, leads.length])

  const updateSubject = (nextSubj: string) => {
    setSubject(nextSubj)
    if (!selectedLead || !campaign) return
    const key = `${selectedLead.id}:${campaign.id}`
    setDrafts((prev) => ({ ...prev, [key]: { subject: nextSubj, body } }))
    void fetch('/api/campaigns/draft', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: campaign.id,
        contactId: selectedLead.id,
        subject: nextSubj,
        body,
      }),
    }).catch(() => {})
  }

  const updateBody = (nextBody: string) => {
    setBody(nextBody)
    if (!selectedLead || !campaign) return
    const key = `${selectedLead.id}:${campaign.id}`
    setDrafts((prev) => ({ ...prev, [key]: { subject, body: nextBody } }))
    void fetch('/api/campaigns/draft', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: campaign.id,
        contactId: selectedLead.id,
        subject,
        body: nextBody,
      }),
    }).catch(() => {})
  }

  const handleRewriteWithAI = async () => {
    if (!selectedLead || !campaign || rewriting) return
    setRewriting(true)
    try {
      const res = await fetch('/api/campaigns/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: campaign.id,
          campaignName: campaign.name,
          campaignDescription: campaign.description,
          senderCompanyName,
          lead: selectedLead,
        }),
      })
      const data = await res.json().catch(() => null)
      if (data?.subject && data?.body) {
        setSubject(data.subject)
        setBody(data.body)
        const key = `${selectedLead.id}:${campaign.id}`
        setDrafts((prev) => ({ ...prev, [key]: { subject: data.subject, body: data.body } }))
      }
    } finally {
      setRewriting(false)
    }
  }

  /** Sends one resolved email through the connected Gmail (SMTP). Returns an error message, or null on success. */
  const sendEmail = async (to: string, subj: string, bodyText: string): Promise<{ error: string | null; code?: string }> => {
    try {
      const res = await fetch('/api/campaigns/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject: subj, body: bodyText }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
      if (!res.ok) return { error: data.error || 'Could not send the email.', code: data.code }
      return { error: null }
    } catch {
      return { error: 'Network error. Please try again.' }
    }
  }

  const draftFor = (lead: CampaignLead) => {
    if (!campaign) return { subject: '', body: '' }
    const saved = drafts[`${lead.id}:${campaign.id}`]
    if (saved) return saved
    const step1 = campaign.steps[0]
    return {
      subject: tokenizeLeadMentions(step1?.subject || 'scaling new buyers', lead),
      body: tokenizeLeadMentions(step1?.body || DEFAULT_OPENER_BODY, lead),
    }
  }

  const handleSendFailure = (result: { error: string | null; code?: string }) => {
    if (result.code === 'inbox_required') setConnectOpen(true)
    if (result.code === 'plan_required') unlock.start()
    setSendStatus(result.error)
  }

  const handleSendAll = async () => {
    if (unlock.needsUnlock) return unlock.start()
    if (!connectedEmail) {
      setConnectOpen(true)
      return
    }
    const targets = leads.filter((l) => l.email && !sentLeadIds.has(l.id))
    if (targets.length === 0) {
      setSendStatus('Nothing left to send. Add email addresses or enrich your leads first.')
      return
    }
    setSendingAll(true)
    let sent = 0
    for (const lead of targets) {
      setSendStatus(`Sending ${sent + 1} of ${targets.length} from ${connectedEmail}…`)
      const draft = draftFor(lead)
      const result = await sendEmail(
        lead.email as string,
        resolveMergeFields(draft.subject, lead),
        resolveMergeFields(draft.body, lead),
      )
      if (result.error) {
        handleSendFailure(result)
        setSendingAll(false)
        if (sent > 0) setSendStatus(`Sent ${sent} of ${targets.length}. Stopped: ${result.error}`)
        return
      }
      sent += 1
      setSentLeadIds((prev) => new Set(prev).add(lead.id))
      await new Promise((r) => setTimeout(r, 1200))
    }
    setSendingAll(false)
    setSendStatus(`Sent ${sent} personalized email${sent === 1 ? '' : 's'} from ${connectedEmail}.`)
  }

  const handleSendSingle = async () => {
    if (unlock.needsUnlock) return unlock.start()
    if (!connectedEmail) {
      setConnectOpen(true)
      return
    }
    if (!selectedLead?.email) {
      setSendStatus('This lead has no email address yet.')
      return
    }
    setSendingOne(true)
    setSendStatus(`Sending to ${selectedLead.email}…`)
    const result = await sendEmail(
      selectedLead.email,
      resolveMergeFields(subject, selectedLead),
      resolveMergeFields(body, selectedLead),
    )
    setSendingOne(false)
    if (result.error) {
      handleSendFailure(result)
      return
    }
    setSentLeadIds((prev) => new Set(prev).add(selectedLead.id))
    setSendStatus(`Sent to ${selectedLead.email} from ${connectedEmail}.`)
  }

  const handleAddPerson = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    const domain = newEmail.includes('@') ? newEmail.split('@')[1] : `${newCompany.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`
    const added: CampaignLead = {
      id: `custom-${Date.now()}`,
      fullName: newName.trim(),
      title: newTitle.trim() || 'Founder',
      email: newEmail.trim() || null,
      linkedinUrl: null,
      companyName: newCompany.trim() || 'Company',
      companyDomain: domain,
    }
    setLeads((prev) => [added, ...prev])
    setSelectedLeadId(added.id)
    setNewName('')
    setNewTitle('')
    setNewCompany('')
    setNewEmail('')
    setAddPersonOpen(false)
  }

  const addFollowupStep = () => {
    setFollowups((prev) => [
      ...prev,
      {
        id: `followup-${Date.now()}`,
        stepOrder: prev.length + 2,
        delayDays: addDelayDays,
        subject: `Re: ${subject}`,
        body: `Hi {{first_name}} ,\n\nWanted to float this back to the top of your inbox in case finding new buyers at {{company}} is a priority this quarter.\n\nOpen to me sending over a 2-minute breakdown?\n\nBest,\nKeith`,
      },
    ])
  }

  const readyCount = leads.filter((l) => l.email).length || leads.length

  return (
    <DashboardShell activeUrl={senderCompanyName} fixedHeight>
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-24">
          <Loader2 className="size-6 animate-spin text-[var(--mh-fg)]" />
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          {/* ================================================================== */}
          {/* Top Campaign Header (Slim Single-Line Bar)                         */}
          {/* ================================================================== */}
          <div className="shrink-0 border-b border-[var(--mh-soft)] bg-[var(--mh-bg)] px-4 py-2 sm:px-6 sm:py-2.5">
            <div className="flex items-center justify-between gap-3">
              {/* Left: Back Link + Icon + Title/Description */}
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <Link
                  href="/campaigns"
                  className="inline-flex shrink-0 items-center gap-1 rounded-[10px] border border-[var(--mh-soft)] px-2.5 py-1 text-xs font-medium text-[var(--mh-muted)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] hover:text-[var(--mh-fg)]"
                >
                  <ChevronLeft className="size-3.5" />
                  <span>Campaigns</span>
                </Link>

                <span className="inline-flex size-6 shrink-0 items-center justify-center text-[var(--mh-fg)]">
                  <Gift className="size-4" strokeWidth={1.8} />
                </span>

                <div className="min-w-0">
                  <h1 className="font-display truncate text-[16px] font-semibold tracking-[-0.025em] text-[var(--mh-fg)] leading-tight sm:text-[18px]">
                    {campaign?.name}
                  </h1>
                  {campaign?.description && (
                    <p className="truncate text-[11px] text-[var(--mh-muted)] leading-tight max-w-xs sm:max-w-md md:max-w-xl">
                      {campaign?.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Right: Actions in the exact same line */}
              <div className="flex shrink-0 items-center gap-2">
                {sendStatus && (
                  <span className="hidden xl:inline text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {sendStatus}
                  </span>
                )}

                <button
                  type="button"
                  disabled={sendingAll || unlock.busy}
                  onClick={() => void handleSendAll()}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-3 text-xs font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90 disabled:opacity-60 ${unlock.needsUnlock ? unlockPulse : ''}`}
                >
                  {sendingAll ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    unlock.needsUnlock ? (
                      <span>Get $30 of Sending Credits</span>
                    ) : !connectedEmail ? (
                      <>
                        <Mail className="size-3" />
                        <span>Connect Gmail to send</span>
                      </>
                    ) : (
                    <>
                      <span>Send all now</span>
                      <span className="rounded-[6px] bg-[var(--mh-bg)]/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none">
                        {readyCount}
                      </span>
                      <Send className="size-3" />
                    </>
                    )
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => router.push('/campaigns')}
                  className="inline-flex h-8 items-center rounded-[10px] border border-[var(--mh-soft)] px-3 text-xs font-medium text-[var(--mh-fg)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)]"
                >
                  New campaign
                </button>
              </div>
            </div>
          </div>

          {/* ================================================================== */}
          {/* Main Split Workspace on Dotted Canvas                              */}
          {/* ================================================================== */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-[radial-gradient(color-mix(in_srgb,var(--mh-fg)_12%,transparent)_1px,transparent_1px)] [background-size:16px_16px] p-3 md:flex-row md:p-5">
            {/* LEFT PANEL: PEOPLE List */}
            <section className="project-card flex h-1/2 md:h-full max-h-full min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-[10px] bg-[var(--mh-card-bg)] md:w-[320px]">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--mh-soft)] px-4 py-3.5">
                <div>
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[var(--mh-fg)]">
                    PEOPLE
                  </p>
                  <p className="text-[12px] text-[var(--mh-muted)]">{leads.length} in this campaign</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAddPersonOpen(true)}
                  className="rounded-[10px] border border-[var(--mh-soft)] px-3 py-1 text-[11px] font-medium text-[var(--mh-fg)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)]"
                >
                  Add
                </button>
              </div>

              {leads.length > 8 && (
                <div className="border-b border-[var(--mh-soft)] px-3 py-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-[var(--mh-muted)]" />
                    <input
                      type="search"
                      value={peopleFilter}
                      onChange={(e) => setPeopleFilter(e.target.value)}
                      placeholder="Filter people…"
                      className="h-7 w-full rounded-[8px] bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] pl-7 pr-2 text-xs text-[var(--mh-fg)] outline-none placeholder:text-[var(--mh-muted)]"
                    />
                  </div>
                </div>
              )}

              <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                {filteredLeads.map((person) => {
                  const selected = person.id === selectedLead?.id
                  return (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedLeadId(person.id)}
                        className={cn(
                          'mb-1 flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors',
                          selected
                            ? 'bg-[color:color-mix(in_srgb,var(--mh-fg)_9%,transparent)]'
                            : 'hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)]',
                        )}
                      >
                        <ContactAvatar
                          name={person.fullName}
                          linkedinUrl={person.linkedinUrl}
                          email={person.email}
                          className="mt-0.5 size-9 rounded-full"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="truncate text-[13px] font-semibold leading-snug text-[var(--mh-fg)]">
                              {person.fullName || 'Unknown'}
                            </span>
                            <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" strokeWidth={2.3} />
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] leading-snug text-[var(--mh-muted)]">
                            {person.title || 'Decision Maker'}
                          </span>
                          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-[var(--mh-muted)]">
                            <CompanyFavicon
                              domain={person.companyDomain}
                              name={person.companyName}
                              className="size-6 rounded-md"
                            />
                            <span className="truncate">{person.companyName || person.companyDomain}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>

            {/* RIGHT PANEL: Sequence Canvas & Email Composer */}
            <section className="flex h-1/2 md:h-full max-h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain px-1 py-1 md:px-4">
              {writingProgress && (
                <p className="mb-3 flex items-center gap-1.5 font-mono text-[12px] font-medium text-[var(--mh-muted)]" role="status">
                  <Sparkles className="size-3.5 animate-pulse text-[var(--mh-fg)]" aria-hidden />
                  <span>
                    Writing email {writingProgress.current} of {writingProgress.total}...
                  </span>
                </p>
              )}

              {/* Primary Opener Email Card */}
              <article className="project-card w-full shrink-0 overflow-hidden rounded-[10px] bg-[var(--mh-card-bg)]">
                {/* Recipient Profile Header, with send-timing + rewrite controls on the right */}
                <div className="flex items-center justify-between gap-3 border-b border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)] px-6 py-4">
                  {selectedLead ? (
                    <div className="flex min-w-0 items-center gap-3.5">
                      <ContactAvatar
                        name={selectedLead.fullName}
                        linkedinUrl={selectedLead.linkedinUrl}
                        email={selectedLead.email}
                        className="size-11 rounded-full"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-[var(--mh-fg)]">
                          {selectedLead.fullName}
                        </p>
                        <p className="truncate text-[12px] text-[var(--mh-muted)]">
                          {[selectedLead.title, selectedLead.companyName].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <span />
                  )}
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden font-mono text-[12px] text-[var(--mh-muted)] md:inline">
                      {senderCompanyName}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] px-3 py-1 text-[11px] font-medium text-[var(--mh-fg)]">
                      <Zap className="size-3" />
                      Sends immediately
                    </span>
                    <button
                      type="button"
                      disabled={rewriting}
                      onClick={() => void handleRewriteWithAI()}
                      className="inline-flex items-center gap-1 rounded-[10px] border border-[var(--mh-soft)] px-3 py-1 text-[12px] font-medium text-[var(--mh-fg)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] disabled:opacity-50"
                    >
                      {rewriting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                      <span>Rewrite</span>
                    </button>
                  </div>
                </div>

                {/* To / Subj / Merge Pills / Email Body */}
                <div className="px-6 py-2">
                  <div className="flex items-center gap-4 border-b border-[var(--mh-soft)] py-3">
                    <span className="w-10 shrink-0 font-mono text-[12px] text-[var(--mh-muted)]">To</span>
                    <span className="min-w-0 truncate text-[14px] text-[var(--mh-fg)]">
                      {selectedLead?.email || 'verified-contact@company.com'}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 border-b border-[var(--mh-soft)] py-3">
                    <span className="w-10 shrink-0 font-mono text-[12px] text-[var(--mh-muted)]">Subj</span>
                    <div className="min-w-0 flex-1">
                      <MergeFieldText
                        value={subject}
                        onChange={updateSubject}
                        lead={selectedLead}
                        placeholder="Subject line"
                      />
                    </div>
                  </div>

                  {/* Merge Field Pills Row */}
                  <div className="flex flex-wrap gap-1.5 py-3">
                    {MERGE_FIELD_KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => updateBody(`${body}${body && !body.endsWith(' ') ? ' ' : ''}{{${key}}}`)}
                        className="rounded-[8px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)] px-2.5 py-1 text-[11px] font-medium text-[var(--mh-muted)] transition-colors hover:text-[var(--mh-fg)]"
                      >
                        {MERGE_FIELD_LABELS[key]}
                      </button>
                    ))}
                  </div>

                  {/* Interactive Email Body with Merge Chips */}
                  <div className="py-3">
                    <MergeFieldText
                      value={body}
                      onChange={updateBody}
                      lead={selectedLead}
                      multiline
                      placeholder="Write your personalized message…"
                    />
                  </div>
                </div>

                {/* Card Bottom Bar: one button that sends, or asks to connect Gmail first */}
                <div className="flex items-center justify-between gap-3 border-t border-[var(--mh-soft)] px-6 py-3.5">
                  <p className="min-w-0 truncate text-[12px] text-[var(--mh-muted)]">
                    {unlock.error ?? sendStatus ?? (connectedEmail ? `Connected as ${connectedEmail} · Ready to send.` : '')}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleSendSingle()}
                    disabled={unlock.busy || sendingOne}
                    className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-5 text-[13px] font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90 disabled:opacity-60 ${unlock.needsUnlock ? unlockPulse : ''}`}
                  >
                    {unlock.needsUnlock ? (
                      <span>Get $30 of Sending Credits</span>
                    ) : connectedEmail ? (
                      <>
                        <span>Send to {selectedLead?.fullName?.split(' ')[0] || 'Lead'}</span>
                        <Send className="size-3.5" />
                      </>
                    ) : (
                      <>
                        <Mail className="size-3.5" />
                        <span>Connect Gmail to send</span>
                      </>
                    )}
                  </button>
                </div>
              </article>

              {/* Follow-up Steps Chain */}
              {followups.map((step, idx) => (
                <div key={step.id} className="flex flex-col items-stretch">
                  <div className="flex flex-col items-center py-1" aria-hidden>
                    <div className="h-5 w-px border-l border-dashed border-[var(--mh-soft)]" />
                  </div>
                  <article className="project-card w-full shrink-0 overflow-hidden rounded-[10px] bg-[var(--mh-card-bg)]">
                    <div className="flex items-center justify-between gap-2 border-b border-[var(--mh-soft)] px-5 py-2.5">
                      <span className="inline-flex items-center gap-1.5 rounded-[8px] bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] px-3 py-1 text-[11px] font-medium text-[var(--mh-muted)]">
                        <Clock3 className="size-3" />
                        Waits {step.delayDays} days, if no reply
                      </span>
                      <button
                        type="button"
                        onClick={() => setFollowups((prev) => prev.filter((s) => s.id !== step.id))}
                        className="text-[var(--mh-muted)] hover:text-red-500"
                        aria-label="Remove follow-up"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <div className="px-6 py-3">
                      <div className="flex items-center gap-4 border-b border-[var(--mh-soft)] py-2">
                        <span className="w-10 shrink-0 font-mono text-[12px] text-[var(--mh-muted)]">Subj</span>
                        <div className="min-w-0 flex-1">
                          <MergeFieldText
                            value={step.subject}
                            onChange={(nextSubj) =>
                              setFollowups((prev) =>
                                prev.map((s, i) => (i === idx ? { ...s, subject: nextSubj } : s)),
                              )
                            }
                            lead={selectedLead}
                          />
                        </div>
                      </div>
                      <div className="py-3">
                        <MergeFieldText
                          value={step.body}
                          onChange={(nextBody) =>
                            setFollowups((prev) =>
                              prev.map((s, i) => (i === idx ? { ...s, body: nextBody } : s)),
                            )
                          }
                          lead={selectedLead}
                          multiline
                        />
                      </div>
                    </div>
                  </article>
                </div>
              ))}

              {/* Add Follow-up Control */}
              <div className="flex flex-col items-center py-1" aria-hidden>
                <div className="h-5 w-px border-l border-dashed border-[var(--mh-soft)]" />
              </div>
              <div className="mb-6 flex w-full shrink-0 items-center justify-center gap-2.5 rounded-[10px] border border-dashed border-[var(--mh-soft)] bg-[var(--mh-bg)]/80 px-4 py-3.5">
                <span className="flex items-center gap-1.5 text-[12px] text-[var(--mh-muted)]">
                  Follow up after
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={addDelayDays}
                    onChange={(e) => setAddDelayDays(Math.max(1, Number(e.target.value) || 3))}
                    className="h-6 w-12 rounded-[6px] border border-[var(--mh-soft)] bg-transparent px-1 text-center text-[12px] text-[var(--mh-fg)]"
                  />
                  days
                </span>
                <button
                  type="button"
                  onClick={addFollowupStep}
                  className="inline-flex items-center gap-1 rounded-[10px] bg-[var(--mh-fg)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90"
                >
                  <Plus className="size-3" />
                  Add follow-up
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      <ConnectGoogleModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        defaultEmail=""
        onConnected={(email) => {
          setConnectedEmail(email)
          setConnectOpen(false)
        }}
      />

      {/* Add Person Modal */}
      {addPersonOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="project-card w-full max-w-md rounded-[10px] bg-[var(--mh-card-bg)] p-6 shadow-xl">
            <h2 className="font-display text-xl font-normal text-[var(--mh-fg)]">Add person to campaign</h2>
            <form onSubmit={handleAddPerson} className="mt-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                <span>Full name</span>
                <input
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Rajiv Ramanan"
                  className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none focus:border-[var(--mh-fg)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                <span>Title</span>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Co-Founder"
                  className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none focus:border-[var(--mh-fg)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                <span>Company</span>
                <input
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  placeholder="e.g. Spendflo"
                  className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none focus:border-[var(--mh-fg)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                <span>Email</span>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="rajiv@spendflo.com"
                  className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none focus:border-[var(--mh-fg)]"
                />
              </label>
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddPersonOpen(false)}
                  className="rounded-[10px] px-4 py-2 text-xs font-medium text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-5 py-2 text-xs font-medium text-[var(--mh-bg)]"
                >
                  Add Person
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}

export default function CampaignSendingPage() {
  return (
    <Suspense>
      <CampaignSendingWorkspace />
    </Suspense>
  )
}
