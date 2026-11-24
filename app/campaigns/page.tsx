'use client'

import { CircleDot, FileEdit, Gift, Loader2, PauseCircle, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { CompanyFavicon } from '@/components/prospects/CompanyFavicon'
import { ContactAvatar } from '@/components/prospects/ContactAvatar'
import { cn } from '@/lib/utils'

type LeadItem = {
  id: string
  fullName: string | null
  title: string | null
  email: string | null
  linkedinUrl: string | null
  companyName: string
  companyDomain: string
}

type CampaignItem = {
  id: string
  name: string
  status: string
  description: string
  pain: string
  targeting: string
  angleType: string
  leadCount: number
  steps: Array<{ id?: string; stepOrder: number; delayDays: number; subject: string; body: string }>
}

function CampaignsContent() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([])
  const [leads, setLeads] = useState<LeadItem[]>([])
  const [tab, setTab] = useState<'all' | 'active' | 'inactive'>('all')
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let mounted = true
    fetch('/api/campaigns')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted) return
        if (data?.campaigns?.length > 0) {
          setCompanyName(data.companyName || '')
          setCampaigns(data.campaigns)
          setLeads(data.leads || [])
          setLoading(false)
          return
        }
        try {
          const raw = localStorage.getItem('apsurn_campaigns_cache')
          if (raw) {
            const cached = JSON.parse(raw)
            if (cached?.campaigns?.length) {
              setCompanyName(cached.companyName || '')
              setCampaigns(
                cached.campaigns.map((c: Record<string, unknown>, i: number) => ({
                  id: String(c.id || `campaign-${i + 1}`),
                  name: String(c.name || 'Campaign'),
                  status: i < 2 ? 'active' : 'draft',
                  description: String(c.positioningHook || ''),
                  pain: String(c.whyItWorks || ''),
                  targeting: `${c.targetPersona || 'Founder'} · ${c.targetSegment || 'ICP'}`,
                  angleType: String(c.angleType || 'pain-point'),
                  leadCount: Array.isArray(cached.leads) ? cached.leads.length : 50,
                  steps: Array.isArray(c.sequence)
                    ? c.sequence.map((s: Record<string, unknown>) => ({
                        stepOrder: Number(s.stepNumber ?? 1),
                        delayDays: Number(s.delayDays ?? 0),
                        subject: String(s.subject ?? ''),
                        body: String(s.body ?? ''),
                      }))
                    : [],
                })),
              )
              if (Array.isArray(cached.leads)) {
                setLeads(
                  cached.leads.map((p: Record<string, unknown>, idx: number) => {
                    const l = (p.lead as Record<string, unknown>) || {}
                    const website = String(l.companyWebsite || '')
                    const domain =
                      website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] ||
                      (typeof l.email === 'string' ? l.email.split('@')[1] : '') ||
                      ''
                    return {
                      id: String(p.id || `lead-${idx}`),
                      fullName: String(l.fullName || p.author || 'Unknown'),
                      title: String(l.jobTitle || 'Decision Maker'),
                      email: typeof l.email === 'string' ? l.email : null,
                      linkedinUrl: typeof l.linkedinUrl === 'string' ? l.linkedinUrl : null,
                      companyName: String(l.companyName || p.community || 'Company'),
                      companyDomain: domain,
                    }
                  }),
                )
              }
            }
          }
        } catch {
          // ignore
        }
        setLoading(false)
      })
      .catch(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      const isActive = c.status === 'active'
      if (tab === 'active') return isActive
      if (tab === 'inactive') return !isActive
      return true
    })
  }, [campaigns, tab])

  const activeCount = campaigns.filter((c) => c.status === 'active').length
  const inactiveCount = campaigns.length - activeCount

  const toggleStatus = async (e: React.MouseEvent, camp: CampaignItem) => {
    e.stopPropagation()
    const nextStatus = camp.status === 'active' ? 'paused' : 'active'
    setCampaigns((prev) => prev.map((c) => (c.id === camp.id ? { ...c, status: nextStatus } : c)))
    await fetch('/api/campaigns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: camp.id, status: nextStatus }),
    }).catch(() => {})
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() }),
      })
      const data = await res.json().catch(() => null)
      const createdId = data?.id || `campaign-${Date.now()}`
      setNewOpen(false)
      router.push(`/campaigns/${encodeURIComponent(createdId)}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <DashboardShell activeUrl={companyName}>
      <main className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6 sm:py-4 md:px-8">
        {/* ================================================================ */}
        {/* Top Single-Line Header Bar                                       */}
        {/* ================================================================ */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mh-soft)] pb-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="font-display truncate text-lg sm:text-xl font-semibold tracking-tight text-[var(--mh-fg)]">
                Campaigns
              </h1>
              <span className="hidden sm:inline font-mono text-[11px] text-[var(--mh-muted)]">
                · {campaigns.length} total · {activeCount} active · {inactiveCount} paused
              </span>
            </div>
            <p className="truncate text-xs text-[var(--mh-muted)] max-w-sm sm:max-w-md">
              Personalized outbound sequences tailored from your ICP.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Active / Inactive Filter Tabs */}
            <div className="flex items-center gap-1 rounded-[10px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)] p-1 text-xs font-medium">
              {[
                { id: 'all', label: `All (${campaigns.length})` },
                { id: 'active', label: `Active (${activeCount})` },
                { id: 'inactive', label: `Inactive (${inactiveCount})` },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id as 'all' | 'active' | 'inactive')}
                  className={cn(
                    'rounded-[8px] px-3 py-1 transition-colors',
                    tab === t.id
                      ? 'bg-[var(--mh-fg)] text-[var(--mh-bg)]'
                      : 'text-[var(--mh-muted)] hover:text-[var(--mh-fg)]',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-3.5 text-xs font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" aria-hidden />
              <span>New campaign</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="size-6 animate-spin text-[var(--mh-fg)]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="project-card flex flex-col items-center justify-center gap-3 rounded-[10px] p-14 text-center">
            <Gift className="size-8 text-[var(--mh-muted)]" />
            <h2 className="font-display text-xl font-normal text-[var(--mh-fg)]">No campaigns in this view</h2>
            <p className="max-w-sm text-xs text-[var(--mh-muted)]">
              Run website setup to generate tailored campaigns from your ICP, or create a new campaign now.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Link
                href="/setup"
                className="rounded-[10px] bg-[var(--mh-fg)] px-4 py-2 text-xs font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90"
              >
                Go to Setup
              </Link>
              <button
                type="button"
                onClick={() => setNewOpen(true)}
                className="rounded-[10px] border border-[var(--mh-soft)] px-4 py-2 text-xs font-medium text-[var(--mh-fg)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)]"
              >
                Create campaign
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((campaign, campIdx) => {
              const isActive = campaign.status === 'active'
              const StatusIcon = isActive ? CircleDot : campaign.status === 'paused' ? PauseCircle : FileEdit
              const samplePeople = leads.slice(campIdx * 3, campIdx * 3 + 4)
              const previewRows = samplePeople.length > 0 ? samplePeople : leads.slice(0, 4)

              return (
                <article
                  key={campaign.id}
                  onClick={() => router.push(`/campaigns/${encodeURIComponent(campaign.id)}`)}
                  className="project-card group flex cursor-pointer flex-col justify-between overflow-hidden rounded-[10px] p-5 transition-all hover:-translate-y-0.5"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => void toggleStatus(e, campaign)}
                        title="Click to toggle Active / Inactive"
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-[8px] px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                          isActive
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                            : 'bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] text-[var(--mh-muted)]',
                        )}
                      >
                        <StatusIcon className="size-3" />
                        <span>{isActive ? 'Active' : 'Inactive'}</span>
                      </button>

                      <span className="font-mono text-[11px] text-[var(--mh-muted)]">
                        {leads.length || campaign.leadCount} contacts · {campaign.steps.length || 3} steps
                      </span>
                    </div>

                    <h2 className="font-display mt-3 text-lg font-normal leading-snug tracking-[-0.02em] text-[var(--mh-fg)]">
                      {campaign.name}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--mh-muted)]">
                      {campaign.description}
                    </p>
                  </div>

                  {/* Preview Table of Leads inside the Campaign Card */}
                  {previewRows.length > 0 && (
                    <div className="mt-4 overflow-hidden rounded-[8px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)]">
                      <div className="grid grid-cols-2 border-b border-[var(--mh-soft)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--mh-muted)]">
                        <span>Company</span>
                        <span>Name</span>
                      </div>
                      <ul className="divide-y divide-[var(--mh-soft)]">
                        {previewRows.map((person) => (
                          <li key={person.id} className="grid grid-cols-2 items-center gap-2 px-3 py-1.5 text-xs">
                            <span className="flex min-w-0 items-center gap-1.5 text-[var(--mh-muted)]">
                              <CompanyFavicon domain={person.companyDomain} name={person.companyName} className="size-6 shrink-0" />
                              <span className="truncate font-medium text-[var(--mh-fg)]">{person.companyName}</span>
                            </span>
                            <span className="flex min-w-0 items-center gap-2">
                              <ContactAvatar
                                name={person.fullName}
                                linkedinUrl={person.linkedinUrl}
                                email={person.email}
                                className="size-5 shrink-0 rounded-full"
                              />
                              <span className="truncate text-[var(--mh-muted)]">{person.fullName}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              )
            })}

            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-[var(--mh-soft)] bg-transparent text-[var(--mh-muted)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)] hover:text-[var(--mh-fg)]"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-[8px] border border-[var(--mh-soft)]">
                <Plus className="size-4" />
              </span>
              <span className="text-xs font-medium">New campaign</span>
            </button>
          </div>
        )}
      </main>

      {/* New Campaign Modal */}
      {newOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="project-card w-full max-w-md rounded-[10px] bg-[var(--mh-card-bg)] p-6 shadow-xl">
            <h2 className="font-display text-xl font-normal text-[var(--mh-fg)]">Create new campaign</h2>
            <p className="mt-1 text-xs text-[var(--mh-muted)]">
              All {leads.length || 50} verified leads from your workspace will be added automatically.
            </p>
            <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-3.5">
              <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                <span>Campaign name</span>
                <input
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Free Trial Users of Competitor Tools"
                  className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none focus:border-[var(--mh-fg)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                <span>Campaign angle / description</span>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="e.g. Send personalized ICP audits to founders using legacy tools…"
                  className="rounded-[10px] border border-[var(--mh-soft)] bg-transparent p-3 text-sm text-[var(--mh-fg)] outline-none focus:border-[var(--mh-fg)]"
                />
              </label>
              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewOpen(false)}
                  className="rounded-[10px] px-3.5 py-1.5 text-xs font-medium text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-4 py-1.5 text-xs font-medium text-[var(--mh-bg)] disabled:opacity-50"
                >
                  {creating && <Loader2 className="size-3.5 animate-spin" />}
                  Create &amp; Open
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}

export default function CampaignsPage() {
  return (
    <Suspense>
      <CampaignsContent />
    </Suspense>
  )
}
