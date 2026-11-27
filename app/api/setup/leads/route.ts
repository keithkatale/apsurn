import { z } from 'zod'
import { scorePosts } from '@/lib/ai'
import { fetchApifyLeads } from '@/lib/apify-leads'
import { getCurrentUserId } from '@/lib/auth/session'
import { logEvent } from '@/lib/events'
import { CREDIT_COSTS, SETUP_FREE_LEAD_CAP } from '@/lib/billing/plans'
import { beginSetupAction, settleSetupAction } from '@/lib/billing/gate'
import { createAdminClient } from '@/lib/supabase/admin'
import { businessProfileSchema, SENIORITY_OPTIONS, type ListenResponse, type SeniorityId } from '@/lib/types'

export const maxDuration = 120

const seniorityIds = SENIORITY_OPTIONS.map((s) => s.id) as [SeniorityId, ...SeniorityId[]]

const bodySchema = z.object({
  companyId: z.string().optional(),
  profile: businessProfileSchema,
  personTitle: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  keywords: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  personCountry: z.array(z.string().trim().min(1).max(80)).max(10).default(['United States']),
  seniority: z.array(z.enum(seniorityIds)).default(['founder', 'c_suite', 'vp', 'head', 'director']),
  apifyToken: z.string().trim().optional(),
})

const TARGET_LEADS = 50

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid Apify lead search request' }, { status: 400 })
  const { companyId: inputCompanyId, profile, personTitle, keywords, personCountry, seniority, apifyToken } = parsed.data

  // Free setup: capped preview. Active plan: up to 50 leads, 3 credits each (as many as the balance covers).
  const gate = await beginSetupAction('prospect_company', 1)
  if (gate.blocked) return gate.blocked
  const leadCap = gate.paid
    ? Math.min(TARGET_LEADS, Math.floor(gate.credits / CREDIT_COSTS.prospect_company))
    : SETUP_FREE_LEAD_CAP
  if (leadCap < 1) {
    return Response.json(
      { error: "You're out of credits. Top up or upgrade to keep going.", code: 'insufficient_credits' },
      { status: 402 },
    )
  }

  try {
    const rawLeads = await fetchApifyLeads({
      personTitle: personTitle.length ? personTitle : profile.icp.buyerPersonas,
      webKeywords: keywords.length ? keywords : profile.icp.industries,
      personCountry: personCountry.length ? personCountry : profile.icp.geographies,
      seniority,
      totalResults: gate.paid ? 100 : Math.max(leadCap * 3, 20),
      apifyToken,
    })

    const top50Raw = rawLeads.slice(0, leadCap)
    const scored = top50Raw.length ? await scorePosts(profile, top50Raw) : []
    const sortedLeads = scored.sort((a, b) => b.score - a.score)

    // Fast bulk persistence of 50 leads & accounts to Supabase
    try {
      const userId = await getCurrentUserId()
      const supabase = createAdminClient()
      const { data: company } = inputCompanyId
        ? { data: { id: inputCompanyId } }
        : await supabase.from('companies').select('id').eq('user_id', userId).maybeSingle()

      if (company?.id && sortedLeads.length > 0) {
        // Reuse or create the single primary setup table (never create duplicate tables)
        const { data: existingLists } = await supabase
          .from('prospect_lists')
          .select('id, name')
          .eq('company_id', company.id)
          .order('created_at', { ascending: true })

        let primaryListId: string | null = null

        const primaryCandidate =
          existingLists?.find(
            (l) =>
              l.name === 'Primary Leads' ||
              l.name.includes('Primary Leads') ||
              l.name.includes('First 50 ICP Leads'),
          ) || existingLists?.[0]

        if (primaryCandidate) {
          primaryListId = primaryCandidate.id
          await supabase
            .from('prospect_lists')
            .update({
              name: 'Primary Leads',
              criteria: {
                is_primary: true,
                personTitle: personTitle.length ? personTitle : profile.icp.buyerPersonas,
                keywords: keywords.length ? keywords : profile.icp.industries,
                personCountry,
              },
              found_count: sortedLeads.length,
              completed_at: new Date().toISOString(),
            })
            .eq('id', primaryListId)

          // Clean up old companies & contacts belonging to this primary list
          const { data: oldCos } = await supabase
            .from('prospect_companies')
            .select('id')
            .eq('list_id', primaryListId)
          if (oldCos && oldCos.length > 0) {
            const coIds = oldCos.map((c) => c.id)
            await supabase.from('contacts').delete().in('prospect_company_id', coIds)
            await supabase.from('prospect_companies').delete().in('id', coIds)
          }

          // Remove any redundant ghost lists
          const redundantIds = (existingLists || [])
            .filter((l) => l.id !== primaryListId && (l.name.includes('First 50') || l.name.includes('Primary Leads')))
            .map((l) => l.id)
          if (redundantIds.length > 0) {
            await supabase.from('prospect_lists').delete().in('id', redundantIds)
          }
        } else {
          const { data: newList } = await supabase
            .from('prospect_lists')
            .insert({
              user_id: userId,
              company_id: company.id,
              name: 'Primary Leads',
              criteria: {
                is_primary: true,
                personTitle: personTitle.length ? personTitle : profile.icp.buyerPersonas,
                keywords: keywords.length ? keywords : profile.icp.industries,
                personCountry,
              },
              status: 'completed',
              requested_count: TARGET_LEADS,
              found_count: sortedLeads.length,
              completed_at: new Date().toISOString(),
            })
            .select('id')
            .single()
          primaryListId = newList?.id || null
        }

        const list = { id: primaryListId }

        const companyRows = sortedLeads
          .filter((item) => Boolean(item.lead))
          .map((item) => {
            const lead = item.lead!
            const domain =
              lead.companyWebsite?.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] ||
              lead.email?.split('@')[1] ||
              null
            return {
              user_id: userId,
              company_id: company.id,
              list_id: list?.id ?? null,
              name: lead.companyName || 'Unknown Account',
              domain,
              website_url: lead.companyWebsite,
              industry: lead.companyIndustry,
              employee_range: lead.companySize,
              location: lead.location,
              country: personCountry[0] || 'United States',
              source: 'apify',
              source_ref: 'peakydev/leads-scraper-ppe',
              icp_fit_score: item.score,
              status: 'new',
              qualify_reason: item.reason,
              outreach_angle: item.outreachAngle,
              description: item.text.slice(0, 500),
            }
          })

        const { data: insertedCompanies } = await supabase
          .from('prospect_companies')
          .insert(companyRows)
          .select('id')

        if (insertedCompanies && insertedCompanies.length > 0) {
          const validLeads = sortedLeads.filter((item) => Boolean(item.lead))
          const contactRows = insertedCompanies.map((co, idx) => {
            const item = validLeads[idx]
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

          const { data: insertedContacts } = await supabase.from('contacts').insert(contactRows).select('id')

          // Also enroll these contacts into any existing sequences for this company
          if (insertedContacts && insertedContacts.length > 0) {
            const { data: existingSeqs } = await supabase
              .from('sequences')
              .select('id')
              .eq('company_id', company.id)

            if (existingSeqs && existingSeqs.length > 0) {
              const enrollments = existingSeqs.flatMap((seq) =>
                insertedContacts.map((c) => ({
                  sequence_id: seq.id,
                  contact_id: c.id,
                  status: 'active',
                  current_step: 1,
                })),
              )
              await supabase.from('enrollments').insert(enrollments)
            }
          }
        }
      }
    } catch (dbErr) {
      console.warn('[setup/leads] DB persistence warning:', dbErr)
    }

    await settleSetupAction(gate, 'prospect_company', sortedLeads.length)
    await logEvent('leads_found', { userId: gate.userId ?? null, props: { count: sortedLeads.length, paid: Boolean(gate.paid) } })

    const body: ListenResponse = {
      posts: sortedLeads,
      sources: [{ source: 'apify', ok: true, count: sortedLeads.length }],
      scannedAt: new Date().toISOString(),
      totalScanned: rawLeads.length,
    }
    return Response.json(body)
  } catch (error) {
    console.error('[setup/leads] error', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to extract 50 leads from Apify' },
      { status: 500 },
    )
  }
}
