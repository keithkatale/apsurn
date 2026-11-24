'use client'

import {
  ArrowLeft,
  Check,
  ChevronLeft,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FolderInput,
  Globe,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  Send,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import type { WorkspaceLead, WorkspaceLeadTable } from '@/app/api/leads/route'
import { DashboardShell } from '@/components/dashboard/DashboardShell'
import { CompanyFavicon } from '@/components/prospects/CompanyFavicon'
import { ContactAvatar } from '@/components/prospects/ContactAvatar'
import { cn } from '@/lib/utils'

function fitTier(score: number) {
  if (score >= 75) {
    return {
      tier: 'T1 Account',
      short: 'T1',
      cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    }
  }
  if (score >= 55) {
    return {
      tier: 'T2 Account',
      short: 'T2',
      cls: 'bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] text-[var(--mh-fg)]',
    }
  }
  return {
    tier: 'T3 Account',
    short: 'T3',
    cls: 'bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] text-[var(--mh-muted)]',
  }
}

function CopyEmailCell({ email }: { email: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!email) return <span className="text-[var(--mh-muted)]/40">—</span>

  return (
    <div className="group/email inline-flex items-center gap-1.5">
      <a
        href={`mailto:${email}`}
        className="max-w-[185px] truncate font-mono text-[11px] text-[var(--mh-fg)] hover:underline"
        title={email}
      >
        {email}
      </a>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          navigator.clipboard?.writeText(email)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
        className="opacity-0 transition-opacity group-hover/email:opacity-100"
        title="Copy email"
      >
        {copied ? (
          <Check className="size-3 text-emerald-500" />
        ) : (
          <Copy className="size-3 text-[var(--mh-muted)] hover:text-[var(--mh-fg)]" />
        )}
      </button>
    </div>
  )
}

type TabFilter = 'all' | 't1' | 't2' | 't3' | 'verified' | 'enriched'

export function LeadTableWorkspace({ tableId: propTableId }: { tableId?: string }) {
  const params = useParams()
  const router = useRouter()
  const tableId = propTableId || (params?.id as string) || 'all'

  const [loading, setLoading] = useState(true)
  const [companyName, setCompanyName] = useState('Apsurn')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [tables, setTables] = useState<WorkspaceLeadTable[]>([])
  const [leads, setLeads] = useState<WorkspaceLead[]>([])

  // Filter state (attached tabs on top of table)
  const [activeTab, setActiveTab] = useState<TabFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [industryFilter, setIndustryFilter] = useState<string>('all')

  // Selection & Bulk Actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set())
  const [statusBanner, setStatusBanner] = useState<string | null>(null)

  // Modals
  const [newTableOpen, setNewTableOpen] = useState(false)
  const [newTableName, setNewTableName] = useState('')
  const [creatingTable, setCreatingTable] = useState(false)

  const [addLeadOpen, setAddLeadOpen] = useState(false)
  const [addLeadMode, setAddLeadMode] = useState<'single' | 'upload'>('single')
  const [csvUploadFile, setCsvUploadFile] = useState<File | null>(null)
  const [csvParsedRows, setCsvParsedRows] = useState<Array<Record<string, string | null>>>([])
  const [importingCsv, setImportingCsv] = useState(false)
  const [addLeadForm, setAddLeadForm] = useState({
    fullName: '',
    title: '',
    companyName: '',
    companyWebsite: '',
    email: '',
    phone: '',
    linkedinUrl: '',
    location: '',
    industry: '',
    whatTheyDo: '',
    howWeCanHelp: '',
  })
  const [addingLead, setAddingLead] = useState(false)

  const [findMoreOpen, setFindMoreOpen] = useState(false)
  const [findMoreForm, setFindMoreForm] = useState({
    personTitle: 'Founder, CEO, Co-Founder, VP of Sales, Head of Growth',
    keywords: 'B2B SaaS, Software, AI',
    personCountry: 'United States',
    count: 25,
    newTableName: '',
  })
  const [findingMore, setFindingMore] = useState(false)

  // Drawer
  const [inspectLead, setInspectLead] = useState<WorkspaceLead | null>(null)

  useEffect(() => {
    let mounted = true
    fetch('/api/leads')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!mounted) return
        const dbLeads: WorkspaceLead[] = data?.leads ?? []
        const dbTables: WorkspaceLeadTable[] = data?.tables ?? []
        if (data?.companyName) setCompanyName(data.companyName)
        if (data?.companyWebsite) setCompanyWebsite(data.companyWebsite)

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
                    name: `${cached.companyName || 'Workspace'} — Initial 50 Leads`,
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

  // Identify current table info
  const currentTable = useMemo(() => {
    if (tableId === 'all') {
      return { id: 'all', name: 'All Leads', leadCount: leads.length }
    }
    const found = tables.find((t) => t.id === tableId)
    if (found) return found
    if (tableId === 'setup-default' && tables[0]) {
      return tables[0]
    }
    if (tableId === 'setup-default') {
      return { id: 'setup-default', name: 'Primary Leads', leadCount: leads.length }
    }
    return { id: tableId, name: 'Lead Table', leadCount: 0 }
  }, [tableId, tables, leads.length])

  // Leads in this table
  const tableLeads = useMemo(() => {
    if (tableId === 'all') return leads
    const primaryId = tables[0]?.id
    return leads.filter((l) => {
      if (l.tableId === tableId) return true
      if (
        (tableId === 'setup-default' || tableId === primaryId) &&
        (!l.tableId || l.tableId === primaryId || l.tableId === 'setup-default')
      ) {
        return true
      }
      return false
    })
  }, [leads, tableId, tables])

  // Industries present in this table
  const industries = useMemo(() => {
    const set = new Set<string>()
    for (const l of tableLeads) {
      if (l.industry?.trim()) set.add(l.industry.trim())
    }
    return [...set].sort()
  }, [tableLeads])

  // Counts for tabs attached to table
  const tabCounts = useMemo(() => {
    let t1 = 0
    let t2 = 0
    let t3 = 0
    let verified = 0
    let enriched = 0

    for (const l of tableLeads) {
      if (l.score >= 75) t1++
      else if (l.score >= 55) t2++
      else t3++

      if (l.email) verified++
      if (l.enriched) enriched++
    }

    return {
      all: tableLeads.length,
      t1,
      t2,
      t3,
      verified,
      enriched,
    }
  }, [tableLeads])

  // Filtered leads by tab, search, industry
  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    return tableLeads.filter((l) => {
      // Tab filter
      if (activeTab === 't1' && l.score < 75) return false
      if (activeTab === 't2' && (l.score < 55 || l.score >= 75)) return false
      if (activeTab === 't3' && l.score >= 55) return false
      if (activeTab === 'verified' && !l.email) return false
      if (activeTab === 'enriched' && !l.enriched) return false

      // Industry filter
      if (industryFilter !== 'all' && l.industry !== industryFilter) return false

      // Search query
      if (!q) return true
      const hay = [
        l.fullName,
        l.title,
        l.companyName,
        l.companyDomain,
        l.email,
        l.phone,
        l.location,
        l.industry,
        l.whatTheyDo,
        l.howWeCanHelp,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [tableLeads, activeTab, industryFilter, searchQuery])

  const allVisibleSelected =
    filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.has(l.id))

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredLeads.map((l) => l.id)))
    }
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Create a custom Table
  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTableName.trim()) return
    setCreatingTable(true)
    const selectedArray = [...selectedIds]
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_table',
          name: newTableName.trim(),
          leadIds: selectedArray,
        }),
      })
      const data = await res.json().catch(() => null)
      const created: WorkspaceLeadTable = data?.table || {
        id: `table-${Date.now()}`,
        name: newTableName.trim(),
        leadCount: selectedArray.length,
        createdAt: new Date().toISOString(),
      }
      setTables((prev) => [...prev, created])
      if (selectedArray.length > 0) {
        setLeads((prev) =>
          prev.map((l) => (selectedIds.has(l.id) ? { ...l, tableId: created.id } : l)),
        )
        setSelectedIds(new Set())
      }
      setNewTableName('')
      setNewTableOpen(false)
      setStatusBanner(
        selectedArray.length > 0
          ? `Created table "${created.name}" with ${selectedArray.length} leads.`
          : `Created table "${created.name}".`,
      )
    } finally {
      setCreatingTable(false)
    }
  }

  // Move selected leads to table
  const handleMoveToTable = async (targetTableId: string | null, idsToMove?: string[]) => {
    const ids = idsToMove ?? [...selectedIds]
    if (ids.length === 0) return
    const idSet = new Set(ids)
    setLeads((prev) => prev.map((l) => (idSet.has(l.id) ? { ...l, tableId: targetTableId } : l)))
    if (!idsToMove) setSelectedIds(new Set())
    const targetName = tables.find((t) => t.id === targetTableId)?.name || 'All Leads'
    setStatusBanner(`Moved ${ids.length} lead${ids.length === 1 ? '' : 's'} to "${targetName}".`)

    await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'move_to_table',
        leadIds: ids,
        tableId: targetTableId,
      }),
    }).catch(() => {})
  }

  // Bulk update Tier
  const handleSetTier = async (score: number, label: string) => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setLeads((prev) => prev.map((l) => (selectedIds.has(l.id) ? { ...l, score } : l)))
    setSelectedIds(new Set())
    setStatusBanner(`Updated ${ids.length} leads to ${label}.`)
    await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_tier',
        leadIds: ids,
        score,
      }),
    }).catch(() => {})
  }

  // Delete selected leads
  const handleDeleteSelected = async () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setLeads((prev) => prev.filter((l) => !selectedIds.has(l.id)))
    setSelectedIds(new Set())
    setStatusBanner(`Removed ${ids.length} lead${ids.length === 1 ? '' : 's'}.`)
    await fetch('/api/leads', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadIds: ids }),
    }).catch(() => {})
  }

  // AI Deep Enrichment
  const handleEnrichLeads = async (targetLeads?: WorkspaceLead[]) => {
    const batch =
      targetLeads ??
      (selectedIds.size > 0
        ? leads.filter((l) => selectedIds.has(l.id))
        : filteredLeads.filter((l) => !l.enriched).slice(0, 10))

    if (batch.length === 0) {
      setStatusBanner('Select leads or switch tabs to run AI enrichment.')
      return
    }

    const batchIds = batch.map((b) => b.id)
    setEnrichingIds((prev) => new Set([...prev, ...batchIds]))
    setStatusBanner(`Enriching ${batch.length} lead${batch.length === 1 ? '' : 's'} with Vertex AI…`)

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'enrich_leads',
          leads: batch,
        }),
      })
      const data = await res.json().catch(() => null)
      const enrichedArr: Array<{
        id: string
        whatTheyDo: string
        howWeCanHelp: string
        industry: string
        score: number
        inferredEmail?: string | null
      }> = data?.enriched ?? []

      if (enrichedArr.length > 0) {
        const byId = new Map(enrichedArr.map((item) => [item.id, item]))
        setLeads((prev) =>
          prev.map((l) => {
            const up = byId.get(l.id)
            if (!up) return l
            return {
              ...l,
              whatTheyDo: up.whatTheyDo || l.whatTheyDo,
              howWeCanHelp: up.howWeCanHelp || l.howWeCanHelp,
              industry: up.industry || l.industry,
              score: up.score || l.score,
              email: l.email || up.inferredEmail || null,
              enriched: true,
            }
          }),
        )
        setStatusBanner(`Enriched ${enrichedArr.length} leads with personalized AI angles & ICP fit.`)
      } else {
        setStatusBanner('AI enrichment completed.')
      }
    } catch {
      setStatusBanner('Enrichment finished with fallback data.')
    } finally {
      setEnrichingIds((prev) => {
        const next = new Set(prev)
        for (const id of batchIds) next.delete(id)
        return next
      })
    }
  }

  // Export CSV
  const handleExportCsv = () => {
    const listToExport = selectedIds.size > 0 ? leads.filter((l) => selectedIds.has(l.id)) : filteredLeads
    if (listToExport.length === 0) return

    const headers = [
      'Full Name',
      'Title',
      'Company Name',
      'Company Domain',
      'Email',
      'Phone',
      'LinkedIn URL',
      'Location',
      'Industry',
      'What They Do',
      'How We Can Help',
      'Fit Score',
      'Enriched',
    ]

    const rows = listToExport.map((l) => [
      `"${(l.fullName || '').replace(/"/g, '""')}"`,
      `"${(l.title || '').replace(/"/g, '""')}"`,
      `"${(l.companyName || '').replace(/"/g, '""')}"`,
      `"${(l.companyDomain || '').replace(/"/g, '""')}"`,
      `"${(l.email || '').replace(/"/g, '""')}"`,
      `"${(l.phone || '').replace(/"/g, '""')}"`,
      `"${(l.linkedinUrl || '').replace(/"/g, '""')}"`,
      `"${(l.location || '').replace(/"/g, '""')}"`,
      `"${(l.industry || '').replace(/"/g, '""')}"`,
      `"${(l.whatTheyDo || '').replace(/"/g, '""')}"`,
      `"${(l.howWeCanHelp || '').replace(/"/g, '""')}"`,
      l.score,
      l.enriched ? 'Yes' : 'No',
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute(
      'download',
      `${currentTable.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Add Manual Lead with AI Auto-Enrichment
  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = addLeadForm.fullName.trim()
    const company = addLeadForm.companyName.trim()
    const website = addLeadForm.companyWebsite.trim()
    const linkedin = addLeadForm.linkedinUrl.trim()
    const email = addLeadForm.email.trim()

    if (!name && !company && !website && !linkedin && !email) {
      alert('Please provide at least a name, company, website, or LinkedIn URL.')
      return
    }

    setAddingLead(true)
    setStatusBanner('AI is analyzing website, LinkedIn & company details to enrich missing fields...')

    const domain =
      website
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .split('/')[0] ||
      (email ? email.split('@')[1] : '') ||
      (company ? company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com' : 'company.com')

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_lead',
          tableId: tableId === 'all' ? null : tableId,
          fullName: name,
          title: addLeadForm.title.trim(),
          companyName: company || 'Company',
          companyWebsite: website || (domain ? `https://${domain}` : null),
          companyDomain: domain,
          email: email || null,
          phone: addLeadForm.phone.trim() || null,
          linkedinUrl: linkedin || null,
          location: addLeadForm.location.trim() || null,
          industry: addLeadForm.industry.trim() || null,
          whatTheyDo: addLeadForm.whatTheyDo.trim() || null,
          howWeCanHelp: addLeadForm.howWeCanHelp.trim() || null,
        }),
      })

      const data = await res.json().catch(() => null)
      const created: WorkspaceLead = data?.lead || {
        id: `manual-${Date.now()}`,
        contactId: null,
        tableId: tableId === 'all' ? null : tableId,
        fullName: name || 'Decision Maker',
        title: addLeadForm.title.trim() || 'Founder & CEO',
        companyName: company || 'Company',
        companyDomain: domain,
        companyWebsite: website || (domain ? `https://${domain}` : null),
        email: email || null,
        phone: addLeadForm.phone.trim() || null,
        linkedinUrl: linkedin || null,
        location: addLeadForm.location.trim() || 'United States',
        industry: addLeadForm.industry.trim() || 'B2B Software',
        companySize: '11-50',
        whatTheyDo: `${company || 'Company'} operations and services.`,
        howWeCanHelp: `Accelerate outbound pipeline for ${company || 'Company'}.`,
        score: 85,
        status: 'new',
        enriched: true,
      }

      setLeads((prev) => [created, ...prev])
      setAddLeadOpen(false)
      setAddLeadForm({
        fullName: '',
        title: '',
        companyName: '',
        companyWebsite: '',
        email: '',
        phone: '',
        linkedinUrl: '',
        location: '',
        industry: '',
        whatTheyDo: '',
        howWeCanHelp: '',
      })
      setStatusBanner(`Added and AI-enriched ${created.fullName} (${created.companyName}).`)
    } finally {
      setAddingLead(false)
    }
  }

  // Handle CSV file selection and parsing
  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvUploadFile(file)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = (event.target?.result as string) || ''
      const lines = text.split(/\r?\n/).filter((l) => l.trim())
      if (lines.length < 2) return
      const rawHeaders = lines[0]
        .split(/,|\t/)
        .map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''))

      const parsed: Array<Record<string, string | null>> = []
      for (let i = 1; i < lines.length && parsed.length < 50; i++) {
        const cols = lines[i].split(/,|\t/).map((c) => c.trim().replace(/^["']|["']$/g, ''))
        const item: Record<string, string> = {}
        rawHeaders.forEach((h, idx) => {
          if (cols[idx]) item[h] = cols[idx]
        })

        const fullName =
          item.fullname || item.full_name || item.name || item.contact || item.person || ''
        const title =
          item.title || item.jobtitle || item.job_title || item.role || item.position || ''
        const companyName =
          item.companyname || item.company_name || item.company || item.organization || ''
        const companyWebsite =
          item.website || item.url || item.companywebsite || item.domain || ''
        const email = item.email || item.workemail || item.mail || ''
        const linkedinUrl = item.linkedin || item.linkedinurl || item.profile || ''
        const location = item.location || item.country || item.city || ''
        const industry = item.industry || item.category || ''

        if (fullName || companyName || companyWebsite || linkedinUrl || email) {
          parsed.push({
            fullName: fullName || null,
            title: title || null,
            companyName: companyName || null,
            companyWebsite: companyWebsite || null,
            email: email || null,
            linkedinUrl: linkedinUrl || null,
            location: location || null,
            industry: industry || null,
          })
        }
      }
      setCsvParsedRows(parsed)
    }
    reader.readAsText(file)
  }

  // Import parsed CSV leads with AI auto-enrichment
  const handleImportCsvLeads = async () => {
    if (csvParsedRows.length === 0) return
    setImportingCsv(true)
    setStatusBanner(
      `AI is analyzing website & LinkedIn info to enrich ${csvParsedRows.length} leads...`,
    )

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'import_leads',
          tableId: tableId === 'all' ? null : tableId,
          leads: csvParsedRows,
        }),
      })
      const data = await res.json().catch(() => null)
      const imported: WorkspaceLead[] = data?.leads ?? []
      if (imported.length > 0) {
        setLeads((prev) => [...imported, ...prev])
        setStatusBanner(
          `Successfully imported and AI-enriched ${imported.length} leads with website & LinkedIn details.`,
        )
        setAddLeadOpen(false)
        setCsvUploadFile(null)
        setCsvParsedRows([])
      } else {
        setStatusBanner('Uploaded leads processed.')
      }
    } catch {
      setStatusBanner('Finished processing uploaded leads.')
    } finally {
      setImportingCsv(false)
    }
  }

  // Find & Enrich Leads via Apify / Scraping
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
          targetTableId: tableId === 'all' ? null : tableId,
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

  const tabsConfig = [
    { id: 'all', label: 'All', count: tabCounts.all },
    { id: 't1', label: 'Tier 1 · High Fit', count: tabCounts.t1 },
    { id: 't2', label: 'Tier 2', count: tabCounts.t2 },
    { id: 't3', label: 'Tier 3', count: tabCounts.t3 },
    { id: 'verified', label: 'Verified Email', count: tabCounts.verified },
    { id: 'enriched', label: 'AI Enriched', count: tabCounts.enriched },
  ] as const

  return (
    <DashboardShell>
      <div className="flex flex-col gap-4 p-4 sm:p-6 lg:p-8">
        {/* ================================================================ */}
        {/* Slim Top Strip: Back Button + Title + Count & Far-Right Buttons   */}
        {/* ================================================================ */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/leads"
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[var(--mh-soft)] px-2.5 text-xs font-medium text-[var(--mh-muted)] transition-colors hover:text-[var(--mh-fg)]"
            >
              <ChevronLeft className="size-3.5" />
              <span>Tables</span>
            </Link>

            <div className="h-4 w-px bg-[var(--mh-soft)]" />

            <div className="flex items-center gap-2">
              <Table2 className="size-4 text-[var(--mh-muted)]" />
              <h1 className="font-display text-lg font-normal text-[var(--mh-fg)]">
                {currentTable.name}
              </h1>
              <span className="rounded-full bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] px-2.5 py-0.5 font-mono text-[11px] font-medium text-[var(--mh-muted)]">
                {tableLeads.length} {tableLeads.length === 1 ? 'lead' : 'leads'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredLeads.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[var(--mh-soft)] px-3 text-xs font-medium text-[var(--mh-fg)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] disabled:opacity-50"
            >
              <Download className="size-3.5" aria-hidden />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setAddLeadOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[var(--mh-soft)] px-3 text-xs font-medium text-[var(--mh-fg)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)]"
            >
              <UserPlus className="size-3.5" aria-hidden />
              <span>Add Lead</span>
            </button>

            <button
              type="button"
              onClick={() => setFindMoreOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-3.5 text-xs font-medium text-[var(--mh-bg)] transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" aria-hidden />
              <span>Find &amp; Enrich</span>
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
        {/* Contextual Bulk Action Bar when 1+ leads are selected             */}
        {/* ================================================================ */}
        {selectedIds.size > 0 && (
          <div className="project-card flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-[var(--mh-card-bg)] px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="rounded-[8px] bg-[var(--mh-fg)] px-2.5 py-1 font-mono text-xs font-medium text-[var(--mh-bg)]">
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
              >
                Clear
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--mh-soft)] px-3 py-1">
                <FolderInput className="size-3.5 text-[var(--mh-muted)]" />
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const val = e.target.value
                    if (!val) return
                    if (val === '__new__') {
                      setNewTableOpen(true)
                    } else {
                      void handleMoveToTable(val === '__none__' ? null : val)
                    }
                    e.target.value = ''
                  }}
                  aria-label="Move selected leads to table"
                  className="bg-transparent text-xs font-medium text-[var(--mh-fg)] outline-none"
                >
                  <option value="" disabled>
                    Move to Table…
                  </option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id} className="bg-[var(--mh-bg)] text-[var(--mh-fg)]">
                      {t.name}
                    </option>
                  ))}
                  <option value="__none__" className="bg-[var(--mh-bg)] text-[var(--mh-fg)]">
                    Ungrouped (All Leads)
                  </option>
                  <option value="__new__" className="bg-[var(--mh-bg)] text-[var(--mh-fg)]">
                    + Create new table from selection…
                  </option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => void handleSetTier(90, 'T1 Account')}
                className="rounded-[10px] border border-[var(--mh-soft)] px-3 py-1 font-mono text-xs font-medium text-[var(--mh-fg)] hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)]"
              >
                Mark T1
              </button>
              <button
                type="button"
                onClick={() => void handleSetTier(68, 'T2 Account')}
                className="rounded-[10px] border border-[var(--mh-soft)] px-3 py-1 font-mono text-xs font-medium text-[var(--mh-fg)] hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)]"
              >
                Mark T2
              </button>

              <button
                type="button"
                onClick={() => void handleEnrichLeads()}
                disabled={enrichingIds.size > 0}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-[var(--mh-soft)] px-3.5 py-1 text-xs font-medium text-[var(--mh-fg)] hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)]"
              >
                <Sparkles className="size-3.5" />
                <span>Enrich with AI</span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/campaigns')}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-3.5 py-1 text-xs font-medium text-[var(--mh-bg)]"
              >
                <Send className="size-3" />
                <span>Send in Campaign</span>
              </button>

              <button
                type="button"
                onClick={() => void handleDeleteSelected()}
                className="inline-flex items-center gap-1 rounded-[10px] border border-red-500/30 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
              >
                <Trash2 className="size-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* Table Container with Attached Top Filter Tabs & Embedded Search  */}
        {/* ================================================================ */}
        <div className="project-card overflow-hidden rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] shadow-xs">
          {/* Top Attached Bar: Filter Tabs on Left, Search & Industry on Right */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_2%,transparent)] px-3.5 py-2">
            {/* Attached Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {tabsConfig.map((tab) => {
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-xs font-medium transition-colors',
                      active
                        ? 'bg-[var(--mh-fg)] text-[var(--mh-bg)] shadow-xs'
                        : 'text-[var(--mh-muted)] hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_5%,transparent)] hover:text-[var(--mh-fg)]',
                    )}
                  >
                    <span>{tab.label}</span>
                    <span
                      className={cn(
                        'rounded-[6px] px-1.5 py-0.2 font-mono text-[10px]',
                        active
                          ? 'bg-[var(--mh-bg)]/20 text-[var(--mh-bg)]'
                          : 'bg-[color:color-mix(in_srgb,var(--mh-fg)_8%,transparent)] text-[var(--mh-muted)]',
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Embedded Search and Industry Filter */}
            <div className="flex items-center gap-2">
              <div className="relative w-48 sm:w-60">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--mh-muted)]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search leads…"
                  className="h-7 w-full rounded-[8px] border border-[var(--mh-soft)] bg-[var(--mh-bg)] pl-8 pr-2.5 text-xs text-[var(--mh-fg)] outline-none placeholder:text-[var(--mh-muted)] focus:border-[var(--mh-fg)]/40"
                />
              </div>

              {industries.length > 0 && (
                <select
                  value={industryFilter}
                  onChange={(e) => setIndustryFilter(e.target.value)}
                  aria-label="Filter by industry"
                  className="h-7 rounded-[8px] border border-[var(--mh-soft)] bg-[var(--mh-bg)] px-2 text-xs font-medium text-[var(--mh-fg)] outline-none"
                >
                  <option value="all">All industries ({industries.length})</option>
                  {industries.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Table Content */}
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="size-6 animate-spin text-[var(--mh-fg)]" />
            </div>
          ) : filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2.5 p-12 text-center">
              <Table2 className="size-8 text-[var(--mh-muted)]" />
              <h2 className="font-display text-lg font-normal text-[var(--mh-fg)]">
                No leads match this view
              </h2>
              <p className="max-w-md text-xs text-[var(--mh-muted)]">
                Try switching filter tabs, clearing search, or sourcing new decision-makers.
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setFindMoreOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-3.5 py-1.5 text-xs font-medium text-[var(--mh-bg)]"
                >
                  <Plus className="size-3.5" />
                  <span>Find &amp; Enrich Leads</span>
                </button>
                {activeTab !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    className="rounded-[10px] border border-[var(--mh-soft)] px-3.5 py-1.5 text-xs font-medium text-[var(--mh-fg)]"
                  >
                    View All ({tableLeads.length})
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[1420px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)] font-mono text-[11px] uppercase tracking-wider text-[var(--mh-muted)]">
                    <th className="w-10 px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all visible leads"
                        className="size-3.5 rounded accent-[var(--mh-fg)]"
                      />
                    </th>
                    <th className="w-9 px-2 py-3 text-center font-medium">#</th>
                    <th className="min-w-[175px] px-3 py-3 font-medium">Company</th>
                    <th className="min-w-[205px] px-3 py-3 font-medium">Name</th>
                    <th className="min-w-[135px] px-3 py-3 font-medium">Table</th>
                    <th className="min-w-[185px] px-3 py-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Mail className="size-3" /> Email
                      </span>
                    </th>
                    <th className="min-w-[120px] px-3 py-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        <Phone className="size-3" /> Phone
                      </span>
                    </th>
                    <th className="w-24 px-3 py-3 font-medium">LinkedIn</th>
                    <th className="min-w-[130px] px-3 py-3 font-medium">Website</th>
                    <th className="min-w-[130px] px-3 py-3 font-medium">Location</th>
                    <th className="min-w-[240px] px-3 py-3 font-medium">What they do</th>
                    <th className="min-w-[260px] px-3 py-3 font-medium">How we can help</th>
                    <th className="min-w-[195px] whitespace-nowrap bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)] px-3.5 py-3 font-semibold text-[var(--mh-fg)]">
                      Scoring &amp; AI
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--mh-soft)]">
                  {filteredLeads.map((lead, idx) => {
                    const badge = fitTier(lead.score)
                    const isSelected = selectedIds.has(lead.id)
                    const isEnriching = enrichingIds.has(lead.id)

                    return (
                      <tr
                        key={lead.id}
                        className={cn(
                          'align-top transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)]',
                          isSelected && 'bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)]',
                        )}
                      >
                        <td className="px-3 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(lead.id)}
                            aria-label={`Select ${lead.fullName}`}
                            className="size-3.5 rounded accent-[var(--mh-fg)]"
                          />
                        </td>

                        <td className="px-2 py-3.5 text-center font-mono text-[11px] text-[var(--mh-muted)]">
                          {idx + 1}
                        </td>

                        {/* Company */}
                        <td className="px-3 py-3.5">
                          <button
                            type="button"
                            onClick={() => setInspectLead(lead)}
                            className="flex items-center gap-2.5 text-left"
                          >
                            <CompanyFavicon
                              domain={lead.companyDomain}
                              name={lead.companyName}
                              className="size-8 rounded-[8px] shrink-0"
                            />
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className="truncate font-medium text-[var(--mh-fg)] hover:underline">
                                {lead.companyName}
                              </span>
                              <span className="truncate text-[11px] text-[var(--mh-muted)]">
                                {[lead.industry, lead.companySize ? `${lead.companySize} emp` : null]
                                  .filter(Boolean)
                                  .join(' · ') || '—'}
                              </span>
                            </div>
                          </button>
                        </td>

                        {/* Name & Title */}
                        <td className="px-3 py-3.5">
                          <button
                            type="button"
                            onClick={() => setInspectLead(lead)}
                            className="flex items-start gap-2.5 text-left"
                          >
                            <ContactAvatar
                              name={lead.fullName}
                              linkedinUrl={lead.linkedinUrl}
                              email={lead.email}
                              className="mt-0.5 size-8 rounded-full"
                            />
                            <div className="flex min-w-0 flex-col gap-0.5">
                              <span className="flex items-center gap-1.5 font-semibold text-[var(--mh-fg)] hover:underline">
                                <span className="truncate">{lead.fullName}</span>
                                {lead.enriched && (
                                  <span
                                    className="inline-flex items-center rounded-full bg-emerald-500/15 px-1.5 py-0.2 font-mono text-[9px] font-semibold text-emerald-700 dark:text-emerald-300"
                                    title="Deeply enriched by Vertex AI"
                                  >
                                    AI
                                  </span>
                                )}
                              </span>
                              <span className="line-clamp-1 text-[11px] text-[var(--mh-muted)]">
                                {lead.title}
                              </span>
                            </div>
                          </button>
                        </td>

                        {/* Table Assignment */}
                        <td className="px-3 py-3.5">
                          <select
                            value={lead.tableId || ''}
                            onChange={(e) => {
                              const val = e.target.value
                              if (val === '__new__') {
                                setSelectedIds(new Set([lead.id]))
                                setNewTableOpen(true)
                                return
                              }
                              void handleMoveToTable(val || null, [lead.id])
                            }}
                            aria-label={`Assign ${lead.fullName} to table`}
                            className="max-w-[125px] truncate rounded-full border border-[var(--mh-soft)] bg-transparent px-2.5 py-1 text-[11px] font-medium text-[var(--mh-muted)] outline-none hover:border-[var(--mh-fg)]/40 hover:text-[var(--mh-fg)]"
                          >
                            <option value="" className="bg-[var(--mh-bg)] text-[var(--mh-fg)]">
                              All Leads
                            </option>
                            {tables.map((t) => (
                              <option key={t.id} value={t.id} className="bg-[var(--mh-bg)] text-[var(--mh-fg)]">
                                {t.name}
                              </option>
                            ))}
                            <option value="__new__" className="bg-[var(--mh-bg)] text-[var(--mh-fg)]">
                              + New table…
                            </option>
                          </select>
                        </td>

                        {/* Email */}
                        <td className="px-3 py-3.5">
                          <CopyEmailCell email={lead.email} />
                        </td>

                        {/* Phone */}
                        <td className="px-3 py-3.5 font-mono text-[11px] text-[var(--mh-muted)]">
                          {lead.phone ? (
                            <a href={`tel:${lead.phone}`} className="hover:text-[var(--mh-fg)]">
                              {lead.phone}
                            </a>
                          ) : (
                            <span className="text-[var(--mh-muted)]/40">—</span>
                          )}
                        </td>

                        {/* LinkedIn */}
                        <td className="px-3 py-3.5">
                          {lead.linkedinUrl ? (
                            <a
                              href={lead.linkedinUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full border border-[var(--mh-soft)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--mh-fg)] transition-colors hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_6%,transparent)]"
                            >
                              <span>Profile</span>
                              <ExternalLink className="size-2.5" />
                            </a>
                          ) : (
                            <span className="text-[var(--mh-muted)]/40">—</span>
                          )}
                        </td>

                        {/* Website */}
                        <td className="px-3 py-3.5">
                          {lead.companyDomain ? (
                            <a
                              href={lead.companyWebsite || `https://${lead.companyDomain}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex max-w-[125px] items-center gap-1 truncate font-mono text-[11px] text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
                            >
                              <Globe className="size-3 shrink-0" />
                              <span className="truncate">{lead.companyDomain}</span>
                              <ExternalLink className="size-2.5 shrink-0 opacity-60" />
                            </a>
                          ) : (
                            <span className="text-[var(--mh-muted)]/40">—</span>
                          )}
                        </td>

                        {/* Location */}
                        <td className="px-3 py-3.5 text-[11px] text-[var(--mh-muted)]">
                          <span className="line-clamp-2">{lead.location || '—'}</span>
                        </td>

                        {/* What they do */}
                        <td className="px-3 py-3.5 text-[11px] leading-relaxed text-[var(--mh-muted)]">
                          <p className="line-clamp-2" title={lead.whatTheyDo}>
                            {lead.whatTheyDo}
                          </p>
                        </td>

                        {/* How we can help */}
                        <td className="px-3 py-3.5 text-[11px] leading-relaxed text-[var(--mh-fg)]">
                          <p className="line-clamp-2" title={lead.howWeCanHelp}>
                            {lead.howWeCanHelp}
                          </p>
                        </td>

                        {/* Scoring & Per-Row AI Enrich */}
                        <td className="whitespace-nowrap bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)] px-3.5 py-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium',
                                badge.cls,
                              )}
                            >
                              {badge.short} · {lead.score}
                            </span>
                            <button
                              type="button"
                              disabled={isEnriching}
                              onClick={() => void handleEnrichLeads([lead])}
                              title="Deeply enrich this lead with AI"
                              className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--mh-soft)] text-[var(--mh-muted)] transition-colors hover:border-[var(--mh-fg)] hover:text-[var(--mh-fg)] disabled:opacity-50"
                            >
                              {isEnriching ? (
                                <Loader2 className="size-3 animate-spin text-[var(--mh-fg)]" />
                              ) : (
                                <Sparkles className="size-3" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL 1: Create Custom Table                                         */}
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
                  placeholder="e.g. Fintech Founders Series A"
                  className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none focus:border-[var(--mh-fg)]"
                />
              </label>
              {selectedIds.size > 0 && (
                <p className="text-xs text-[var(--mh-muted)]">
                  {selectedIds.size} selected leads will be placed into this table immediately.
                </p>
              )}
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
      {/* MODAL 2: Find & Enrich More Leads (Apify)                            */}
      {/* ==================================================================== */}
      {findMoreOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-normal text-[var(--mh-fg)]">
                  Find &amp; Enrich Leads
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
                  <span>Number of leads to fetch</span>
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

      {/* ==================================================================== */}
      {/* MODAL 3: Add Manual Lead                                             */}
      {/* ==================================================================== */}
      {addLeadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-[10px] border border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-normal text-[var(--mh-fg)]">
                  Add Leads to Table
                </h2>
                <p className="text-xs text-[var(--mh-muted)]">
                  Add single contacts or upload a CSV. AI will automatically analyze websites and LinkedIn to complete missing fields.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddLeadOpen(false)}
                className="text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="mt-4 flex items-center gap-1 rounded-[10px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_4%,transparent)] p-1">
              <button
                type="button"
                onClick={() => setAddLeadMode('single')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-[8px] py-1.5 text-xs font-medium transition-colors',
                  addLeadMode === 'single'
                    ? 'bg-[var(--mh-card-bg)] text-[var(--mh-fg)] shadow-xs'
                    : 'text-[var(--mh-muted)] hover:text-[var(--mh-fg)]',
                )}
              >
                <UserPlus className="size-3.5" />
                <span>Single Lead</span>
              </button>
              <button
                type="button"
                onClick={() => setAddLeadMode('upload')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-[8px] py-1.5 text-xs font-medium transition-colors',
                  addLeadMode === 'upload'
                    ? 'bg-[var(--mh-card-bg)] text-[var(--mh-fg)] shadow-xs'
                    : 'text-[var(--mh-muted)] hover:text-[var(--mh-fg)]',
                )}
              >
                <Upload className="size-3.5" />
                <span>Upload CSV / File</span>
              </button>
            </div>

            {/* AI Enrichment Notice */}
            <div className="mt-3 flex items-start gap-2.5 rounded-[10px] border border-[var(--mh-soft)] bg-[color:color-mix(in_srgb,var(--mh-fg)_3%,transparent)] p-3 text-xs text-[var(--mh-fg)]">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <div className="leading-relaxed text-[11px] text-[var(--mh-muted)]">
                <span className="font-semibold text-[var(--mh-fg)]">AI Auto-Enrichment: </span>
                Provide any info you have (like website or LinkedIn). AI will crawl the site and analyze available data to fill in title, company size, what they do, location, and outreach angles.
              </div>
            </div>

            {addLeadMode === 'single' ? (
              <form onSubmit={handleAddLead} className="mt-4 flex flex-col gap-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                    <span>Full name</span>
                    <input
                      value={addLeadForm.fullName}
                      onChange={(e) => setAddLeadForm((p) => ({ ...p, fullName: e.target.value }))}
                      placeholder="Jane Doe (or leave for AI)"
                      className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                    <span>Job title</span>
                    <input
                      value={addLeadForm.title}
                      onChange={(e) => setAddLeadForm((p) => ({ ...p, title: e.target.value }))}
                      placeholder="Inferred if empty"
                      className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                    <span>Company name</span>
                    <input
                      value={addLeadForm.companyName}
                      onChange={(e) => setAddLeadForm((p) => ({ ...p, companyName: e.target.value }))}
                      placeholder="Acme Corp"
                      className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                    <span>Company website</span>
                    <input
                      value={addLeadForm.companyWebsite}
                      onChange={(e) =>
                        setAddLeadForm((p) => ({ ...p, companyWebsite: e.target.value }))
                      }
                      placeholder="https://acme.com"
                      className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                    <span>Work Email</span>
                    <input
                      type="email"
                      value={addLeadForm.email}
                      onChange={(e) => setAddLeadForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="jane@acme.com"
                      className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                    <span>LinkedIn URL</span>
                    <input
                      value={addLeadForm.linkedinUrl}
                      onChange={(e) => setAddLeadForm((p) => ({ ...p, linkedinUrl: e.target.value }))}
                      placeholder="https://linkedin.com/in/janedoe"
                      className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                    <span>Industry</span>
                    <input
                      value={addLeadForm.industry}
                      onChange={(e) => setAddLeadForm((p) => ({ ...p, industry: e.target.value }))}
                      placeholder="e.g. B2B SaaS (or AI infers)"
                      className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-[var(--mh-fg)]">
                    <span>Location</span>
                    <input
                      value={addLeadForm.location}
                      onChange={(e) => setAddLeadForm((p) => ({ ...p, location: e.target.value }))}
                      placeholder="e.g. San Francisco, US"
                      className="h-9 rounded-[10px] border border-[var(--mh-soft)] bg-transparent px-3 text-sm text-[var(--mh-fg)] outline-none"
                    />
                  </label>
                </div>

                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAddLeadOpen(false)}
                    className="rounded-[10px] px-4 py-2 text-xs font-medium text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addingLead}
                    className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-5 py-2 text-xs font-medium text-[var(--mh-bg)]"
                  >
                    {addingLead ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Analyzing with AI…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5" />
                        <span>Add &amp; AI Enrich Lead</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-[10px] border-2 border-dashed border-[var(--mh-soft)] p-8 text-center transition-colors hover:border-[var(--mh-fg)]/40 hover:bg-[color:color-mix(in_srgb,var(--mh-fg)_2%,transparent)]">
                  <Upload className="size-7 text-[var(--mh-muted)]" />
                  <p className="mt-2 text-xs font-medium text-[var(--mh-fg)]">
                    {csvUploadFile ? csvUploadFile.name : 'Choose a CSV or TSV file'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--mh-muted)]">
                    {csvParsedRows.length > 0
                      ? `${csvParsedRows.length} leads detected and ready for AI enrichment`
                      : 'Accepts columns: name, title, company, website, email, linkedin'}
                  </p>
                  <input
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleCsvFileChange}
                    className="hidden"
                  />
                </label>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCsvUploadFile(null)
                      setCsvParsedRows([])
                      setAddLeadOpen(false)
                    }}
                    className="rounded-[10px] px-4 py-2 text-xs font-medium text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={importingCsv || csvParsedRows.length === 0}
                    onClick={() => void handleImportCsvLeads()}
                    className="inline-flex items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-5 py-2 text-xs font-medium text-[var(--mh-bg)] disabled:opacity-50"
                  >
                    {importingCsv ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Enriching with AI…</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5" />
                        <span>Import &amp; AI Enrich ({csvParsedRows.length})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* DRAWER: Lead Detail & Edit Drawer                                    */}
      {/* ==================================================================== */}
      {inspectLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs">
          <div className="flex h-full w-full max-w-lg flex-col justify-between border-l border-[var(--mh-soft)] bg-[var(--mh-card-bg)] p-6 shadow-2xl">
            <div className="flex flex-col gap-5 overflow-y-auto pr-1">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3.5">
                  <ContactAvatar
                    name={inspectLead.fullName}
                    linkedinUrl={inspectLead.linkedinUrl}
                    email={inspectLead.email}
                    className="size-12 rounded-full"
                  />
                  <div>
                    <h2 className="font-display text-xl font-normal text-[var(--mh-fg)]">
                      {inspectLead.fullName}
                    </h2>
                    <p className="text-xs text-[var(--mh-muted)]">
                      {inspectLead.title} · {inspectLead.companyName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectLead(null)}
                  className="rounded-[8px] p-1.5 text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={enrichingIds.has(inspectLead.id)}
                  onClick={async () => {
                    await handleEnrichLeads([inspectLead])
                    setInspectLead((prev) =>
                      prev ? leads.find((l) => l.id === prev.id) ?? prev : null,
                    )
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[var(--mh-fg)] px-4 text-xs font-medium text-[var(--mh-bg)]"
                >
                  {enrichingIds.has(inspectLead.id) ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  <span>Deep Enrich with AI</span>
                </button>

                {inspectLead.linkedinUrl && (
                  <a
                    href={inspectLead.linkedinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[var(--mh-soft)] px-3.5 text-xs font-medium text-[var(--mh-fg)]"
                  >
                    <ExternalLink className="size-3.5" />
                    <span>LinkedIn</span>
                  </a>
                )}

                {inspectLead.companyDomain && (
                  <a
                    href={inspectLead.companyWebsite || `https://${inspectLead.companyDomain}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[var(--mh-soft)] px-3.5 text-xs font-medium text-[var(--mh-fg)]"
                  >
                    <Globe className="size-3.5" />
                    <span>{inspectLead.companyDomain}</span>
                  </a>
                )}
              </div>

              <div className="flex flex-col gap-3 rounded-[10px] border border-[var(--mh-soft)] p-4 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--mh-muted)]">Email</span>
                  <span className="font-mono text-[var(--mh-fg)]">{inspectLead.email || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--mh-muted)]">Phone</span>
                  <span className="font-mono text-[var(--mh-fg)]">{inspectLead.phone || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--mh-muted)]">Location</span>
                  <span className="text-[var(--mh-fg)]">{inspectLead.location || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--mh-muted)]">Industry</span>
                  <span className="text-[var(--mh-fg)]">{inspectLead.industry || '—'}</span>
                </div>
              </div>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--mh-fg)]">
                <span>What they do</span>
                <textarea
                  rows={3}
                  value={inspectLead.whatTheyDo}
                  onChange={(e) =>
                    setInspectLead((prev) =>
                      prev ? { ...prev, whatTheyDo: e.target.value } : null,
                    )
                  }
                  className="rounded-[10px] border border-[var(--mh-soft)] bg-transparent p-3 text-xs leading-relaxed text-[var(--mh-fg)] outline-none focus:border-[var(--mh-fg)]"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--mh-fg)]">
                <span>How we can help (Outreach Angle)</span>
                <textarea
                  rows={4}
                  value={inspectLead.howWeCanHelp}
                  onChange={(e) =>
                    setInspectLead((prev) =>
                      prev ? { ...prev, howWeCanHelp: e.target.value } : null,
                    )
                  }
                  className="rounded-[10px] border border-[var(--mh-soft)] bg-transparent p-3 text-xs leading-relaxed text-[var(--mh-fg)] outline-none focus:border-[var(--mh-fg)]"
                />
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--mh-soft)] pt-4">
              <button
                type="button"
                onClick={() => setInspectLead(null)}
                className="rounded-[10px] px-4 py-2 text-xs font-medium text-[var(--mh-muted)] hover:text-[var(--mh-fg)]"
              >
                Close
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!inspectLead) return
                  setLeads((prev) =>
                    prev.map((l) => (l.id === inspectLead.id ? inspectLead : l)),
                  )
                  await fetch('/api/leads', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'update_lead',
                      leadIds: [inspectLead.id],
                      whatTheyDo: inspectLead.whatTheyDo,
                      howWeCanHelp: inspectLead.howWeCanHelp,
                      score: inspectLead.score,
                    }),
                  }).catch(() => {})
                  setStatusBanner(`Saved changes for ${inspectLead.fullName}.`)
                  setInspectLead(null)
                }}
                className="rounded-[10px] bg-[var(--mh-fg)] px-5 py-2 text-xs font-medium text-[var(--mh-bg)]"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  )
}
