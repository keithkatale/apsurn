import { randomUUID } from 'node:crypto'
import { analyzeBusiness, analyzeCompetitorsAndPositioning, generateCampaigns, scorePosts } from '@/lib/ai'
import { fetchApifyLeads } from '@/lib/apify-leads'
import { GUEST_EMAIL_SUFFIX } from '@/lib/auth/guest'
import { makeSlug } from '@/lib/reports'
import { scrapeBusinessSite } from '@/lib/scrape-site'
import { createAdminClient } from '@/lib/supabase/admin'
import { SENIORITY_OPTIONS, type BusinessProfile, type CompetitorAnalysisResult } from '@/lib/types'

/**
 * Runs the normal setup pipeline (scan, ICP and blueprint, competitors, leads, campaigns) for a business the admin
 * typed in. The result lives under a hidden "report owner" account, never under the admin's own workspace, so one
 * admin can build any number of reports. Each step is its own call so none runs past a request timeout, and each
 * can be re-run safely.
 */

const LEAD_TARGET = 25
const mergeTags = (text: string) =>
  text
    .replace(/\{\{\s*firstName\s*\}\}/gi, '{{first_name}}')
    .replace(/\{\{\s*fullName\s*\}\}/gi, '{{full_name}}')
    .replace(/\{\{\s*companyName\s*\}\}/gi, '{{company}}')
    .replace(/\{\{\s*company_name\s*\}\}/gi, '{{company}}')
    .replace(/\{\{\s*jobTitle\s*\}\}/gi, '{{title}}')

export async function startReportBuild(adminId: string, rawUrl: string): Promise<{ shareId: string; slug: string; name: string }> {
  const site = await scrapeBusinessSite(rawUrl).catch((error) => {
    throw new Error(`Could not read that website: ${error instanceof Error ? error.message : 'unknown error'}`)
  })
  if (site.pages[0].text.length < 80 && !site.meta.description) {
    throw new Error('That site renders almost no readable text (it may be client-side rendered or blocking bots).')
  }
  const profile = await analyzeBusiness(site)
  const admin = createAdminClient()

  const { data: owner, error: ownerError } = await admin.auth.admin.createUser({
    email: `report-${randomUUID()}${GUEST_EMAIL_SUFFIX}`,
    email_confirm: true,
    user_metadata: { guest: true, report_owner: true, created_by: adminId },
  })
  if (ownerError || !owner.user) throw new Error(ownerError?.message ?? 'Could not create the report workspace')

  try {
    const { data: company, error: companyError } = await admin
      .from('companies')
      .insert({ user_id: owner.user.id, website_url: site.url, name: profile.companyName, status: 'ready' })
      .select('id')
      .single()
    if (companyError || !company) throw new Error(companyError?.message ?? 'company insert failed')

    const { error: blueprintError } = await admin.from('company_blueprints').insert({
      company_id: company.id,
      raw_scrape: { rootUrl: site.url, pagesRead: site.pages.map((p) => p.url) },
      profile,
      icp: {
        industries: profile.icp.industries,
        companySizeRange: profile.icp.companySize,
        geographies: profile.icp.geographies,
        budgetSignals: profile.icp.buyingTriggers,
      },
      personas: profile.icp.buyerPersonas.map((title) => ({
        title,
        seniority: 'decision_maker',
        painPoints: profile.icp.painPoints,
        goals: profile.keyFeatures,
      })),
      value_prop: profile.valueProposition,
      positioning: `${profile.category} — ${profile.oneLiner}`,
      product_summary: profile.oneLiner,
      competitors: profile.competitors,
      confidence: 'model',
      model_used: 'vertex',
      generated_at: new Date().toISOString(),
    })
    if (blueprintError) throw new Error(blueprintError.message)

    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = makeSlug(profile.companyName)
      const { data: share, error } = await admin
        .from('report_shares')
        .insert({ slug, company_id: company.id, created_by: adminId, source_url: site.url, status: 'building' })
        .select('id')
        .single()
      if (!error && share) return { shareId: share.id as string, slug, name: profile.companyName }
      if (error?.code !== '23505') throw new Error(error?.message ?? 'share insert failed')
    }
    throw new Error('Could not allocate a unique link')
  } catch (error) {
    await admin.from('companies').delete().eq('user_id', owner.user.id)
    await admin.auth.admin.deleteUser(owner.user.id)
    throw error
  }
}

async function loadBuild(shareId: string, adminId: string) {
  const admin = createAdminClient()
  const { data: share } = await admin.from('report_shares').select('id, company_id, created_by').eq('id', shareId).maybeSingle()
  if (!share || share.created_by !== adminId) throw new Error('Report not found')
  const { data: company } = await admin.from('companies').select('id, user_id, website_url').eq('id', share.company_id).maybeSingle()
  const { data: blueprint } = await admin.from('company_blueprints').select('profile, raw_scrape').eq('company_id', share.company_id).maybeSingle()
  if (!company || !blueprint?.profile) throw new Error('Report workspace is missing')
  return {
    admin,
    company,
    profile: blueprint.profile as BusinessProfile,
    rawScrape: (blueprint.raw_scrape ?? {}) as Record<string, unknown> & { competitorAnalysis?: CompetitorAnalysisResult },
  }
}

export async function buildCompetitors(shareId: string, adminId: string): Promise<void> {
  const { admin, company, profile, rawScrape } = await loadBuild(shareId, adminId)
  const result = await analyzeCompetitorsAndPositioning({ url: company.website_url, profile })
  const { error } = await admin
    .from('company_blueprints')
    .update({
      competitors: result.competitors.map((c) => c.name),
      raw_scrape: { ...rawScrape, competitorAnalysis: result },
      approved_at: new Date().toISOString(),
    })
    .eq('company_id', company.id)
  if (error) throw new Error(error.message)
}

export async function buildLeads(shareId: string, adminId: string): Promise<{ count: number }> {
  const { admin, company, profile } = await loadBuild(shareId, adminId)
  const personCountry = profile.icp.geographies.length ? profile.icp.geographies : ['United States']
  const raw = await fetchApifyLeads({
    personTitle: profile.icp.buyerPersonas,
    webKeywords: profile.icp.industries,
    personCountry,
    seniority: SENIORITY_OPTIONS.filter((s) => ['founder', 'c_suite', 'vp', 'head', 'director'].includes(s.id)).map((s) => s.id),
    totalResults: LEAD_TARGET * 3,
  })
  const scored = (raw.length ? await scorePosts(profile, raw.slice(0, LEAD_TARGET)) : []).filter((item) => item.lead).sort((a, b) => b.score - a.score)
  if (!scored.length) throw new Error('No leads came back for this business. Try the step again.')

  // Re-running replaces the previous attempt instead of stacking duplicates.
  const { data: old } = await admin.from('prospect_companies').select('id').eq('company_id', company.id)
  if (old?.length) {
    const ids = old.map((o) => o.id as string)
    await admin.from('contacts').delete().in('prospect_company_id', ids)
    await admin.from('prospect_companies').delete().in('id', ids)
  }

  const rows = scored.map((item) => {
    const lead = item.lead!
    const domain = lead.companyWebsite?.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || lead.email?.split('@')[1] || null
    return {
      user_id: company.user_id,
      company_id: company.id,
      name: lead.companyName || 'Unknown Account',
      domain,
      website_url: lead.companyWebsite,
      industry: lead.companyIndustry,
      employee_range: lead.companySize,
      location: lead.location,
      country: personCountry[0],
      source: 'apify',
      source_ref: 'peakydev/leads-scraper-ppe',
      icp_fit_score: item.score,
      status: 'new',
      qualify_reason: item.reason,
      outreach_angle: item.outreachAngle,
      description: item.text.slice(0, 500),
    }
  })
  const { data: inserted, error } = await admin.from('prospect_companies').insert(rows).select('id')
  if (error || !inserted) throw new Error(error?.message ?? 'lead insert failed')

  const contacts = inserted.map((co, i) => {
    const item = scored[i]
    const lead = item.lead!
    return {
      prospect_company_id: co.id,
      full_name: lead.fullName,
      title: lead.jobTitle,
      email: lead.email,
      email_status: lead.email ? 'verified' : 'unverified',
      phone: lead.phone,
      linkedin_url: lead.linkedinUrl,
      country: lead.location,
      source: 'apify',
      contact_origin: 'setup',
      lead_status: 'new',
      qualify_reason: item.reason,
    }
  })
  const { error: contactError } = await admin.from('contacts').insert(contacts)
  if (contactError) throw new Error(contactError.message)
  return { count: inserted.length }
}

export async function buildCampaigns(shareId: string, adminId: string): Promise<{ count: number }> {
  const { admin, company, profile, rawScrape } = await loadBuild(shareId, adminId)
  const positioning = rawScrape.competitorAnalysis?.positioningStrategy ?? null
  const campaigns = await generateCampaigns({
    profile,
    positioning,
    competitors: rawScrape.competitorAnalysis?.competitors.map((c) => c.name) ?? profile.competitors,
    leadsCount: LEAD_TARGET,
  })
  if (!campaigns.length) throw new Error('No campaigns were generated. Try the step again.')

  await admin.from('sequences').delete().eq('company_id', company.id)
  for (let idx = 0; idx < campaigns.length; idx++) {
    const campaign = campaigns[idx]
    const { data: seq, error } = await admin
      .from('sequences')
      .insert({
        user_id: company.user_id,
        company_id: company.id,
        name: campaign.name,
        status: idx < 2 ? 'active' : 'draft',
        description: campaign.positioningHook,
        pain: campaign.whyItWorks,
        targeting: `${campaign.targetPersona} · ${campaign.targetSegment}`,
        estimated_volume: campaign.matchedLeadCount ?? LEAD_TARGET,
        segment_key: campaign.angleType,
      })
      .select('id')
      .single()
    if (error || !seq) throw new Error(error?.message ?? 'sequence insert failed')
    if (campaign.sequence.length) {
      const { error: stepError } = await admin.from('sequence_steps').insert(
        campaign.sequence.map((step) => ({
          sequence_id: seq.id,
          step_order: step.stepNumber,
          delay_days: step.delayDays,
          subject_template: mergeTags(step.subject),
          body_template: mergeTags(step.body),
          stop_on_reply: true,
        })),
      )
      if (stepError) throw new Error(stepError.message)
    }
  }
  return { count: campaigns.length }
}

export async function finishReport(shareId: string, adminId: string): Promise<void> {
  const { admin, company } = await loadBuild(shareId, adminId)
  const { count } = await admin.from('prospect_companies').select('id', { count: 'exact', head: true }).eq('company_id', company.id)
  if (!count) throw new Error('This report has no leads yet. Run the leads step first.')
  const { error } = await admin.from('report_shares').update({ status: 'ready' }).eq('id', shareId)
  if (error) throw new Error(error.message)
}

export async function revokeReport(shareId: string, adminId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from('report_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId)
    .eq('created_by', adminId)
  if (error) throw new Error(error.message)
}
