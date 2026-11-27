import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BusinessProfile, CompetitorAnalysisResult } from '@/lib/types'

export type ReportLead = {
  company: string
  industry: string | null
  size: string | null
  location: string | null
  website: string | null
  fit: number | null
  reason: string
  angle: string
  contactName: string | null
  contactTitle: string | null
}

export type ReportSequence = {
  id: string
  name: string
  persona: string
  segment: string
  hook: string
  why: string
  steps: Array<{ order: number; delayDays: number; subject: string; body: string }>
}

export type Report = {
  slug: string
  createdAt: string
  company: { name: string; websiteUrl: string }
  profile: BusinessProfile | null
  competitors: CompetitorAnalysisResult | null
  leads: ReportLead[]
  leadTotal: number
  sequences: ReportSequence[]
}

export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://apsurn.com').replace(/\/+$/, '')
}

export function reportUrl(slug: string): string {
  return `${appBaseUrl()}/r/${slug}`
}

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

/** e.g. "acme-k3f9x2": readable, and the random tail stops people guessing other companies' reports. */
export function makeSlug(name: string): string {
  const tail = randomBytes(4).toString('hex').slice(0, 6)
  return `${slugify(name) || 'report'}-${tail}`
}

/** Public read. Returns null for unknown or revoked slugs. Contact emails and phones are never loaded. */
export async function getReportBySlug(slug: string): Promise<Report | null> {
  if (!/^[a-z0-9-]{3,64}$/.test(slug)) return null
  const admin = createAdminClient()
  const { data: share } = await admin
    .from('report_shares')
    .select('slug, company_id, created_at')
    .eq('slug', slug)
    .eq('status', 'ready')
    .is('revoked_at', null)
    .maybeSingle()
  if (!share) return null

  const { data: company } = await admin.from('companies').select('id, name, website_url').eq('id', share.company_id).maybeSingle()
  if (!company) return null

  const [{ data: blueprint }, { data: prospects, count }, { data: sequences }] = await Promise.all([
    admin.from('company_blueprints').select('profile, raw_scrape').eq('company_id', company.id).maybeSingle(),
    admin
      .from('prospect_companies')
      .select(
        'name, website_url, domain, industry, employee_range, location, icp_fit_score, qualify_reason, outreach_angle, contacts!contacts_prospect_company_id_fkey(full_name, title)',
        { count: 'exact' },
      )
      .eq('company_id', company.id)
      .order('icp_fit_score', { ascending: false })
      .limit(25),
    admin
      .from('sequences')
      .select('id, name, description, pain, targeting, sequence_steps(step_order, delay_days, subject_template, body_template)')
      .eq('company_id', company.id)
      .order('created_at', { ascending: true })
      .limit(10),
  ])

  const rawScrape = (blueprint?.raw_scrape as { competitorAnalysis?: CompetitorAnalysisResult } | null) ?? {}

  return {
    slug,
    createdAt: share.created_at,
    company: { name: company.name || company.website_url, websiteUrl: company.website_url },
    profile: (blueprint?.profile as BusinessProfile | null) ?? null,
    competitors: rawScrape.competitorAnalysis ?? null,
    leadTotal: count ?? prospects?.length ?? 0,
    leads: (prospects ?? []).map((p) => {
      const contact = Array.isArray(p.contacts) ? p.contacts[0] : null
      return {
        company: p.name,
        industry: p.industry ?? null,
        size: p.employee_range ?? null,
        location: p.location ?? null,
        website: p.website_url ?? (p.domain ? `https://${p.domain}` : null),
        fit: p.icp_fit_score ?? null,
        reason: p.qualify_reason ?? '',
        angle: p.outreach_angle ?? '',
        contactName: contact?.full_name ?? null,
        contactTitle: contact?.title ?? null,
      }
    }),
    sequences: (sequences ?? []).map((s) => {
      const [persona = 'Decision maker', segment = 'ICP accounts'] = (s.targeting ?? '').split(' · ')
      const steps = Array.isArray(s.sequence_steps) ? [...s.sequence_steps].sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0)) : []
      return {
        id: s.id,
        name: s.name,
        persona,
        segment,
        hook: s.description ?? '',
        why: s.pain ?? '',
        steps: steps.map((st) => ({ order: st.step_order, delayDays: st.delay_days, subject: st.subject_template, body: st.body_template })),
      }
    }),
  }
}

export type ClaimResult =
  | { ok: true; companyId: string }
  | { ok: false; reason: 'not_found' | 'has_workspace' | 'already_claimed' | 'failed' }

type Row = Record<string, unknown>

/** Copy of a row without its identity and parent keys, ready to insert under a new parent. */
function strip(row: Row, ...drop: string[]): Row {
  const copy: Row = { ...row }
  for (const key of ['id', ...drop]) delete copy[key]
  return copy
}

/**
 * Seeds a brand-new account with a copy of a shared report's setup (company, blueprint, target accounts with
 * contacts, email sequences). Refuses when the account already has a workspace; nothing is ever overwritten.
 * Links to the owner's inbox, lists and canonical records are dropped, since those belong to someone else.
 */
export async function claimReport(slug: string, userId: string): Promise<ClaimResult> {
  if (!/^[a-z0-9-]{3,64}$/.test(slug)) return { ok: false, reason: 'not_found' }
  const admin = createAdminClient()

  const { data: share } = await admin.from('report_shares').select('company_id').eq('slug', slug).eq('status', 'ready').is('revoked_at', null).maybeSingle()
  if (!share) return { ok: false, reason: 'not_found' }

  const { data: prior } = await admin.from('report_claims').select('id').eq('user_id', userId).maybeSingle()
  if (prior) return { ok: false, reason: 'already_claimed' }
  const { data: mine } = await admin.from('companies').select('id').eq('user_id', userId).maybeSingle()
  if (mine) return { ok: false, reason: 'has_workspace' }

  const { data: source } = await admin.from('companies').select('*').eq('id', share.company_id).maybeSingle()
  if (!source) return { ok: false, reason: 'not_found' }

  let companyId: string | null = null
  try {
    const { data: company, error: companyError } = await admin
      .from('companies')
      .insert({ ...strip(source, 'user_id', 'created_at', 'updated_at'), user_id: userId })
      .select('id')
      .single()
    if (companyError || !company) throw new Error(companyError?.message ?? 'company insert failed')
    companyId = company.id as string

    const { data: blueprint } = await admin.from('company_blueprints').select('*').eq('company_id', source.id).maybeSingle()
    if (blueprint) {
      const { error } = await admin.from('company_blueprints').insert({ ...strip(blueprint, 'company_id'), company_id: companyId })
      if (error) throw new Error(error.message)
    }

    const { data: prospects } = await admin.from('prospect_companies').select('*').eq('company_id', source.id).is('archived_at', null)
    for (const prospect of prospects ?? []) {
      const { data: created, error } = await admin
        .from('prospect_companies')
        .insert({
          ...strip(prospect, 'company_id', 'user_id', 'list_id', 'canonical_company_id', 'recommended_contact_id'),
          company_id: companyId,
          user_id: userId,
        })
        .select('id')
        .single()
      if (error || !created) throw new Error(error?.message ?? 'prospect insert failed')
      const { data: contacts } = await admin.from('contacts').select('*').eq('prospect_company_id', prospect.id).is('archived_at', null)
      if (contacts?.length) {
        const { error: contactError } = await admin
          .from('contacts')
          .insert(contacts.map((c) => ({ ...strip(c, 'prospect_company_id', 'canonical_person_id'), prospect_company_id: created.id })))
        if (contactError) throw new Error(contactError.message)
      }
    }

    const { data: sequences } = await admin.from('sequences').select('*').eq('company_id', source.id)
    for (const sequence of sequences ?? []) {
      const { data: created, error } = await admin
        .from('sequences')
        .insert({ ...strip(sequence, 'company_id', 'user_id', 'from_inbox_id', 'created_at', 'updated_at'), company_id: companyId, user_id: userId })
        .select('id')
        .single()
      if (error || !created) throw new Error(error?.message ?? 'sequence insert failed')
      const { data: steps } = await admin.from('sequence_steps').select('*').eq('sequence_id', sequence.id)
      if (steps?.length) {
        const { error: stepError } = await admin.from('sequence_steps').insert(steps.map((s) => ({ ...strip(s, 'sequence_id'), sequence_id: created.id })))
        if (stepError) throw new Error(stepError.message)
      }
    }

    const { error: claimError } = await admin.from('report_claims').insert({ slug, user_id: userId, company_id: companyId })
    if (claimError) throw new Error(claimError.message)
    return { ok: true, companyId }
  } catch (error) {
    console.error('[reports] claim failed', error instanceof Error ? error.message : error)
    if (companyId) await rollbackClaim(companyId)
    return { ok: false, reason: 'failed' }
  }
}

/** Best-effort undo of a half-finished copy, so the person can retry or start fresh with a clean account. */
async function rollbackClaim(companyId: string): Promise<void> {
  const admin = createAdminClient()
  try {
    const { data: prospects } = await admin.from('prospect_companies').select('id').eq('company_id', companyId)
    const prospectIds = (prospects ?? []).map((p) => p.id as string)
    if (prospectIds.length) await admin.from('contacts').delete().in('prospect_company_id', prospectIds)
    await admin.from('prospect_companies').delete().eq('company_id', companyId)
    const { data: sequences } = await admin.from('sequences').select('id').eq('company_id', companyId)
    const sequenceIds = (sequences ?? []).map((s) => s.id as string)
    if (sequenceIds.length) await admin.from('sequence_steps').delete().in('sequence_id', sequenceIds)
    await admin.from('sequences').delete().eq('company_id', companyId)
    await admin.from('company_blueprints').delete().eq('company_id', companyId)
    await admin.from('companies').delete().eq('id', companyId)
  } catch (error) {
    console.error('[reports] rollback failed', error instanceof Error ? error.message : error)
  }
}

/** The report a sign-up came from, read from the post-auth redirect (/r/<slug>/claim). */
export function reportSlugFromPath(next: unknown): string | null {
  if (typeof next !== 'string') return null
  return /^\/r\/([a-z0-9-]{3,64})\/claim(?:[/?#]|$)/.exec(next)?.[1] ?? null
}
