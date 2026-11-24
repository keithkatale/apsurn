'use client'

import {
  ArrowRight,
  FolderPlus,
  Loader2,
  Mail,
  Plus,
  Sparkles,
  Table2,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import type { WorkspaceLead, WorkspaceLeadTable } from '@/app/api/leads/route'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { ContactAvatar } from '@/components/prospects/ContactAvatar'
import { cn } from '@/lib/utils'

function LeadsDirectory() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [tables, setTables] = useState<WorkspaceLeadTable[]>([])
  const [leads, setLeads] = useState<WorkspaceLead[]>([])
  const [statusBanner, setStatusBanner] = useState<string | null>(null)

  // Modals
  const [newTableOpen, setNewTableOpen] = useState(false)
  const [newTableName, setNewTableName] = useState('')
  const [creatingTable, setCreatingTable] = useState(false)

  const [findMoreOpen, setFindMoreOpen] = useState(false)
  const [findMoreForm, setFindMoreForm] = useState({
    personTitle: 'Founder, CEO, Co-Founder, VP of Sales, Head of Growth',
    keywords: 'B2B SaaS, Software, AI',
    personCountry: 'United States',
    count: 25,
    newTableName: '',
  })
  const [findingMore, setFindingMore] = useState(false)

  useEffect(() => {
    let mounted = true
    fetch('/api/leads')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted) return
        const dbLeads: WorkspaceLead[] = data?.leads ?? []
        const dbTables: WorkspaceLeadTable[] = data?.tables ?? []

        if (dbLeads.length === 0) {
          try {
            const raw = localStorage.getItem('apsurn_campaigns_cache')
            if (raw) {
              const cached = JSON.parse(raw)
              if (Array.isArray(cached?.leads) && cached.leads.length > 0) {
                const fallbackLeads: WorkspaceLead[] = cached.leads.map(
                  (p: Record<string, unknown>, idx: number) => {
                    const l = (p.lead as Record<string, unknown>) || {}
                    const website = String(l.companyWebsite || '')
                    const email = typeof l.email === 'string' ? l.email : null
                    const domain =
                      website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] ||
                      (email ? email.split('@')[1] : '') ||
                      ''
                    return {
                      id: String(p.id || `lead-${idx}`),
                      contactId: null,
                      tableId: 'setup-default',
                      fullName: String(l.fullName || p.author || 'Decision Maker'),
                      title: String(l.jobTitle || 'Founder'),
                      companyName: String(l.companyName || p.community || 'Company'),
                      companyDomain: domain,
                      companyWebsite: website || null,
                      email,
                      phone: typeof l.phone === 'string' ? l.phone : null,
                      linkedinUrl: typeof l.linkedinUrl === 'string' ? l.linkedinUrl : null,
                      location: typeof l.location === 'string' ? l.location : 'United States',
                      industry: typeof l.companyIndustry === 'string' ? l.companyIndustry : 'B2B Software',
                      companySize: typeof l.companySize === 'string' ? l.companySize : null,
                      whatTheyDo: String(p.text || l.companyIndustry || 'B2B Technology'),
                      howWeCanHelp: String(p.outreachAngle || p.reason || 'High-fit ICP account'),
                      score: Number(p.score ?? 82),
                      status: 'new',
                      enriched: false,
                    }
                  },
                )
                setLeads(fallbackLeads)
                setTables([
                  {
                    id: 'setup-default',
                    name: `${cached.companyName || 'Workspace'} — Primary ICP Leads`,
                    leadCount: fallbackLeads.length,
                    createdAt: new Date().toISOString(),
                  },
                ])
                setLoading(false)
                return
              }
            }
          } catch {
            // ignore
          }
        }

        setLeads(dbLeads)
        setTables(dbTables)
        setLoading(false)
      })
      .catch(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  // Aggregate stats
  const stats = useMemo(() => {
    let t1 = 0
    let verified = 0
    let enriched = 0

    for (const l of leads) {
      if (l.score >= 75) t1++
      if (l.email) verified++
      if (l.enriched) enriched++
    }

    return {
      totalLeads: leads.length,
      t1,
      verified,
      enriched,
      totalTables: tables.length,
    }
  }, [leads, tables.length])

  // Count leads per table
  const tableCounts = useMemo(() => {
    const map = new Map<string, number>()
    const primaryId = tables[0]?.id
    for (const l of leads) {
      const key = l.tableId || primaryId || 'setup-default'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [leads, tables])

  // Get sample avatars for each table
  const tableSampleAvatars = useMemo(() => {
    const map = new Map<string, WorkspaceLead[]>()
    const primaryId = tables[0]?.id
    for (const l of leads) {
      const key = l.tableId || primaryId || 'setup-default'
      const arr = map.get(key) ?? []
      if (arr.length < 5) {
        arr.push(l)
        map.set(key, arr)
      }
    }
    return map
  }, [leads, tables])

  // Create Table
  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTableName.trim()) return
    setCreatingTable(true)

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_table',
          name: newTableName.trim(),
          leadIds: [],
        }),
      })
      const data = await res.json().catch(() => null)
      const created: WorkspaceLeadTable = data?.table || {
        id: `table-${Date.now()}`,
        name: newTableName.trim(),
        leadCount: 0,
        createdAt: new Date().toISOString(),
      }
      setTables((prev) => [...prev, created])
      setNewTableName('')
      setNewTableOpen(false)
      setStatusBanner(`Created table "${created.name}".`)
      router.push(`/leads/${created.id}`)
    } finally {
      setCreatingTable(false)
    }
  }

  // Delete custom table
  const handleDeleteTable = async (tableId: string, tableName: string) => {
    if (!confirm(`Are you sure you want to delete the table "${tableName}"?`)) return
    setTables((prev) => prev.filter((t) => t.id !== tableId))
    setLeads((prev) => prev.map((l) => (l.tableId === tableId ? { ...l, tableId: null } : l)))
    setStatusBanner(`Deleted table "${tableName}".`)
    await fetch('/api/leads', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId }),
    }).catch(() => {})
  }

  // Find & Enrich Leads via Apify
  const handleFindMore = async (e: React.FormEvent) => {
    e.preventDefault()
    setFindingMore(true)
    setStatusBanner('Sourcing verified decision-makers via Apify LinkedIn Scraper…')

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_more',
          personTitle: findMoreForm.personTitle,
          keywords: findMoreForm.keywords,
          personCountry: findMoreForm.personCountry,
          count: findMoreForm.count,
          targetTableId: null,
          newTableName: findMoreForm.newTableName.trim() || undefined,
        }),
      })

      const data = await res.json().catch(() => null)
      const addedLeads: WorkspaceLead[] = data?.addedLeads ?? []
      const newTable: WorkspaceLeadTable | undefined = data?.newTable

      if (newTable) {
        setTables((prev) => [...prev, newTable])
      }

      if (addedLeads.length > 0) {
        setLeads((prev) => [...addedLeads, ...prev])
        setStatusBanner(
          `Successfully sourced and enriched ${addedLeads.length} leads with verified contact details.`,
        )
      } else {
        setStatusBanner('Sourced new verified leads.')
      }
      setFindMoreOpen(false)
    } catch {
      setStatusBanner('Finished sourcing leads.')
      setFindMoreOpen(false)
    } finally {
      setFindingMore(false)
    }
  }

  return (
    <DashboardShell>
      <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
        {/* ================================================================ */}
        {/* Slim Top Strip: Title + Count Badge & Far-Right Action Buttons   */}
        {/* ================================================================ */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-normal text-[var(--mh-fg)]">
              Leads
            </h1>
            <span className="rounded-full bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] px-2.5 py-0.5 font-mono text-[11px] font-medium text-[var(--mh-muted)]">
              {tables.length} {tables.length === 1 ? 'table' : 'tables'} · {stats.totalLeads} total leads
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setNewTableOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[var(--mh-soft)] px-3 text-xs font-medium text-[var(--mh-fg)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)]"
            >
              <FolderPlus className="size-3.5" aria-hidden />
              <span>New Table</span>
            </button>

            <button
              type="button"
              onClick={() => setFindMoreOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-3.5 text-xs font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" aria-hidden />
              <span>Find &amp; Enrich Leads</span>
            </button>
          </div>
        </div>

        {statusBanner && (
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)] px-4 py-2 text-xs text-[var(--mh-fg)]">
            <span className="flex items-center gap-2">
              <Sparkles className="size-3.5 shrink-0" />
              <span>{statusBanner}</span>
            </span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* Quick Stats Grid                                                 */}
        {/* ================================================================ */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="project-card rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-[var(--mh-muted)]">
              <span>Total Leads</span>
              <Users className="size-4" />
            </div>
            <p className="mt-2 font-display text-2xl font-normal text-[var(--mh-fg)]">
              {stats.totalLeads}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--mh-muted)]">Across all active tables</p>
          </div>

          <div className="project-card rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-[var(--mh-muted)]">
              <span>Tier 1 · High Fit</span>
              <Sparkles className="size-4 text-emerald-500" />
            </div>
            <p className="mt-2 font-display text-2xl font-normal text-[var(--mh-fg)]">
              {stats.t1}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--mh-muted)]">Score ≥ 75 ICP match</p>
          </div>

          <div className="project-card rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-[var(--mh-muted)]">
              <span>Verified Emails</span>
              <Mail className="size-4" />
            </div>
            <p className="mt-2 font-display text-2xl font-normal text-[var(--mh-fg)]">
              {stats.verified}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--mh-muted)]">Deliverable direct mailboxes</p>
          </div>

          <div className="project-card rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-4 shadow-xs">
            <div className="flex items-center justify-between text-xs text-[var(--mh-muted)]">
              <span>AI Enriched</span>
              <Sparkles className="size-4" />
            </div>
            <p className="mt-2 font-display text-2xl font-normal text-[var(--mh-fg)]">
              {stats.enriched}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--mh-muted)]">Deep insights &amp; angles</p>
          </div>
        </div>

        {/* ================================================================ */}
        {/* Tables Directory Grid                                            */}
        {/* ================================================================ */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--mh-muted)]">
              Lead Tables &amp; Groups
            </h2>
            <span className="text-xs text-[var(--mh-muted)]">
              Click a table to inspect, filter, or export
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-6 animate-spin text-[var(--mh-fg)]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tables.map((t, idx) => {
                const isPrimary = idx === 0 || t.id === 'setup-default' || t.name.toLowerCase().includes('primary')
                const count = tableCounts.get(t.id) ?? t.leadCount ?? (isPrimary ? leads.length : 0)
                const avatars = tableSampleAvatars.get(t.id) || (isPrimary ? leads.slice(0, 4) : [])

                return (
                  <div
                    key={t.id}
                    className="project-card group relative flex flex-col justify-between rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-5 transition-all hover:border-[var(--mh-fg)]/40 hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-9 items-center justify-center rounded-[10px] bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] text-[var(--mh-fg)]">
                            {isPrimary ? <Users className="size-4" /> : <Table2 className="size-4" />}
                          </div>
                          <div>
                            <Link
                              href={`/leads/${t.id}`}
                              className="font-display text-base font-normal text-[var(--mh-fg)] hover:underline"
                            >
                              {t.name}
                            </Link>
                            <p className="text-[11px] text-[var(--mh-muted)]">
                              {isPrimary ? 'Workspace setup leads' : 'Custom prospect list'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="rounded-full bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] px-2 py-0.5 font-mono text-[11px] font-medium text-[var(--mh-muted)]">
                            {count} leads
                          </span>
                          {!isPrimary && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                void handleDeleteTable(t.id, t.name)
                              }}
                              title={`Delete table "${t.name}"`}
                              className="rounded-[6px] p-1 text-[var(--mh-muted)] hover:bg-red-500/10 hover:text-red-500"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="mt-3 text-xs leading-relaxed text-[var(--mh-muted)]">
                        {isPrimary
                          ? 'Initial batch of high-scoring decision-makers generated during workspace setup.'
                          : 'Organized group for segmented outreach, enrichment, and specific campaigns.'}
                      </p>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-[var(--mh-soft)] pt-3.5">
                      <div className="flex -space-x-1.5 overflow-hidden">
                        {avatars.length > 0 ? (
                          avatars.map((l) => (
                            <ContactAvatar
                              key={l.id}
                              name={l.fullName}
                              linkedinUrl={l.linkedinUrl}
                              email={l.email}
                              className="size-6 rounded-full border-2 border-[var(--mh-card-bg)]"
                            />
                          ))
                        ) : (
                          <span className="text-[11px] text-[var(--mh-muted)]">Empty table</span>
                        )}
                      </div>

                      <Link
                        href={`/leads/${t.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--mh-fg)] hover:underline"
                      >
                        <span>Open Table</span>
                        <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </div>
                  </div>
                )
              })}

              {/* Create New Table Quick Card */}
              <button
                type="button"
                onClick={() => setNewTableOpen(true)}
                className="project-card flex flex-col items-center justify-center gap-2.5 rounded-[10px] border border-dashed border-[var(--mh-soft)] bg-[var(--mh-card-bg)]/40 p-8 text-center transition-all hover:border-[var(--mh-fg)]/60 hover:bg-[var(--mh-card-bg)]"
              >
                <div className="flex size-10 items-center justify-center rounded-[10px] bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] text-[var(--mh-fg)]">
                  <Plus className="size-5" />
                </div>
                <div>
                  <h3 className="font-display text-base font-normal text-[var(--mh-fg)]">
                    Create New Table
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--mh-muted)]">
                    Group leads by campaign, industry, or persona
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL: Create New Table                                              */}
      {/* ==================================================================== */}
      {newTableOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-normal text-[var(--mh-fg)]">
                Create New Table
              </h2>
              <button
                type="button"
                onClick={() => setNewTableOpen(false)}
                className="text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
              >
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTable} className="mt-4 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--mh-fg)]">
                <span>Table name</span>
                <input
                  required
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="e.g. Fintech Series A Founders"
                  className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none focus:border-[var(--mh-fg)]"
                />
              </label>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setNewTableOpen(false)}
                  className="rounded-[10px] px-3 py-1.5 text-xs font-medium text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingTable || !newTableName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-4 py-1.5 text-xs font-medium text-[var(--mh-bg)] disabled:opacity-50"
                >
                  {creatingTable && <Loader2 className="size-3.5 animate-spin" />}
                  <span>Create Table</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: Find & Enrich More Leads (Apify)                              */}
      {/* ==================================================================== */}
      {findMoreOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-normal text-[var(--mh-fg)]">
                  Find &amp; Enrich Leads via Apify
                </h2>
                <p className="mt-0.5 text-xs text-[var(--mh-muted)]">
                  Source verified decision-makers using Apify &amp; deep-enrich with AI
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFindMoreOpen(false)}
                className="text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleFindMore} className="mt-4 flex flex-col gap-3.5">
              <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                <span>Target Job Titles (comma-separated)</span>
                <input
                  required
                  value={findMoreForm.personTitle}
                  onChange={(e) => setFindMoreForm((p) => ({ ...p, personTitle: e.target.value }))}
                  placeholder="Founder, CEO, VP Sales, Head of Marketing"
                  className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                <span>Industry or Niche Keywords</span>
                <input
                  required
                  value={findMoreForm.keywords}
                  onChange={(e) => setFindMoreForm((p) => ({ ...p, keywords: e.target.value }))}
                  placeholder="B2B SaaS, AI, HealthTech, Supply Chain"
                  className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                  <span>Target Country / Geo</span>
                  <input
                    value={findMoreForm.personCountry}
                    onChange={(e) =>
                      setFindMoreForm((p) => ({ ...p, personCountry: e.target.value }))
                    }
                    placeholder="United States"
                    className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                  <span>Number of leads</span>
                  <select
                    value={findMoreForm.count}
                    onChange={(e) =>
                      setFindMoreForm((p) => ({ ...p, count: Number(e.target.value) }))
                    }
                    className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-bg)] px-3 text-sm text-[var(--mh-fg)] outline-none"
                  >
                    <option value={10}>10 verified leads</option>
                    <option value={25}>25 verified leads</option>
                    <option value={50}>50 verified leads</option>
                  </select>
                </label>
              </div>

              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFindMoreOpen(false)}
                  className="rounded-[10px] px-4 py-2 text-xs font-medium text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={findingMore}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-5 py-2 text-xs font-medium text-[var(--mh-bg)]"
                >
                  {findingMore ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Sourcing from Apify…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-3.5" />
                      <span>Fetch &amp; Enrich</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsDirectory />
    </Suspense>
  )
}
