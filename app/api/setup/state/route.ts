import { getCurrentUserId } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BusinessProfile, CompetitorAnalysisResult, GeneratedCampaign, ScoredPost } from '@/lib/types'

export async function GET() {
  try {
    const userId = await getCurrentUserId()
    const supabase = createAdminClient()

    const { data: company } = await supabase
      .from('companies')
      .select('id, name, website_url, status')
      .eq('user_id', userId)
      .maybeSingle()

    if (!company?.id) {
      return Response.json({ company: null })
    }

    const [{ data: blueprint }, { data: prospectCos }, { data: sequences }] = await Promise.all([
      supabase
        .from('company_blueprints')
        .select('profile, raw_scrape, approved_at')
        .eq('company_id', company.id)
        .maybeSingle(),
      supabase
        .from('prospect_companies')
        .select(
          'id, name, domain, website_url, industry, employee_range, location, country, icp_fit_score, qualify_reason, outreach_angle, description, contacts!contacts_prospect_company_id_fkey(id, full_name, title, email, phone, linkedin_url, country)',
        )
        .eq('company_id', company.id)
        .order('icp_fit_score', { ascending: false })
        .limit(50),
      supabase
        .from('sequences')
        .select('id, name, description, pain, targeting, estimated_volume, segment_key, sequence_steps(step_order, delay_days, subject_template, body_template)')
        .eq('company_id', company.id)
        .order('created_at', { ascending: true })
        .limit(10),
    ])

    const rawScrape = (blueprint?.raw_scrape as { pagesRead?: string[]; competitorAnalysis?: CompetitorAnalysisResult } | null) ?? {}
    const profile = (blueprint?.profile as BusinessProfile | null) ?? null
    const competitorAnalysis = rawScrape.competitorAnalysis ?? null

    const leads: ScoredPost[] = (prospectCos ?? []).map((co, idx) => {
      const contact = Array.isArray(co.contacts) ? co.contacts[0] : null
      const fullName = contact?.full_name || co.name
      return {
        id: co.id || `lead-${idx}`,
        source: 'apify',
        url: contact?.linkedin_url || co.website_url || 'https://apify.com',
        title: contact?.title ? `${fullName} · ${contact.title} @ ${co.name}` : `${fullName} @ ${co.name}`,
        text: co.description || `${co.industry ?? ''} · ${co.employee_range ?? ''}`,
        author: contact?.email || fullName,
        community: co.name,
        createdAt: new Date().toISOString(),
        keyword: contact?.title || 'ICP Lead',
        engagement: null,
        score: co.icp_fit_score ?? 80,
        intent: 'buying',
        reason: co.qualify_reason ?? '',
        outreachAngle: co.outreach_angle ?? '',
        lead: {
          fullName,
          jobTitle: contact?.title ?? null,
          seniority: null,
          department: null,
          email: contact?.email ?? null,
          phone: contact?.phone ?? null,
          linkedinUrl: contact?.linkedin_url ?? null,
          location: co.location ?? contact?.country ?? null,
          companyName: co.name,
          companyWebsite: co.website_url ?? (co.domain ? `https://${co.domain}` : null),
          companyLinkedinUrl: null,
          companyIndustry: co.industry ?? null,
          companySize: co.employee_range ?? null,
          companyRevenue: null,
        },
      }
    })

    const campaigns: GeneratedCampaign[] = (sequences ?? []).map((seq) => {
      const [targetPersona = 'Decision Maker', targetSegment = 'ICP Accounts'] = (seq.targeting ?? '').split(' · ')
      const steps = Array.isArray(seq.sequence_steps)
        ? [...seq.sequence_steps].sort((a, b) => (a.step_order ?? 1) - (b.step_order ?? 1))
        : []
      return {
        id: seq.id,
        name: seq.name,
        angleType: (seq.segment_key as GeneratedCampaign['angleType']) || 'pain-point',
        targetPersona,
        targetSegment,
        positioningHook: seq.description ?? '',
        whyItWorks: seq.pain ?? '',
        matchedLeadCount: seq.estimated_volume ?? 25,
        sequence: steps.map((s) => ({
          stepNumber: s.step_order,
          delayDays: s.delay_days,
          label: s.delay_days === 0 ? 'Day 1 · Initial Outreach' : `Day ${s.delay_days} · Follow-up`,
          subject: s.subject_template,
          body: s.body_template,
        })),
      }
    })

    return Response.json({
      company,
      pagesRead: rawScrape.pagesRead ?? [company.website_url],
      profile,
      competitorAnalysis,
      leads,
      campaigns,
    })
  } catch {
    return Response.json({ company: null })
  }
}
