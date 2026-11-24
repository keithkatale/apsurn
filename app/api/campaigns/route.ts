import { z } from 'zod'
import { getCurrentUserId } from '@/lib/auth/session'
import { tokenizeLeadMentions } from '@/lib/outreach/merge-fields'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const userId = await getCurrentUserId()
    const supabase = createAdminClient()

    const { data: company } = await supabase
      .from('companies')
      .select('id, name, website_url')
      .eq('user_id', userId)
      .maybeSingle()

    if (!company?.id) {
      return Response.json({ companyName: 'Apsurn', campaigns: [], leads: [], drafts: {} })
    }

    const [{ data: prospectCos }, { data: sequences }, { data: savedDrafts }] = await Promise.all([
      supabase
        .from('prospect_companies')
        .select(
          'id, name, domain, website_url, industry, employee_range, location, icp_fit_score, qualify_reason, outreach_angle, contacts!contacts_prospect_company_id_fkey(id, full_name, title, email, phone, linkedin_url, country)',
        )
        .eq('company_id', company.id)
        .order('icp_fit_score', { ascending: false })
        .limit(60),
      supabase
        .from('sequences')
        .select(
          'id, name, status, description, pain, targeting, estimated_volume, segment_key, created_at, sequence_steps(id, step_order, delay_days, subject_template, body_template)',
        )
        .eq('company_id', company.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('outreach_drafts')
        .select('contact_id, sequence_id, sequence_step_id, subject, body')
        .eq('user_id', userId),
    ])

    const leads = (prospectCos ?? []).flatMap((co) => {
      const contacts = Array.isArray(co.contacts) && co.contacts.length > 0 ? co.contacts : [null]
      return contacts.map((contact) => {
        const domain =
          co.domain ||
          co.website_url?.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] ||
          (contact?.email ? contact.email.split('@')[1] : '') ||
          ''
        return {
          id: contact?.id || co.id,
          fullName: contact?.full_name || co.name || 'Decision Maker',
          title: contact?.title || 'Founder',
          email: contact?.email || null,
          phone: contact?.phone || null,
          linkedinUrl: contact?.linkedin_url || null,
          companyName: co.name || 'Company',
          companyDomain: domain,
          industry: co.industry || null,
          outreachAngle: co.outreach_angle || co.qualify_reason || null,
          score: co.icp_fit_score ?? 85,
        }
      })
    })

    const campaigns = (sequences ?? []).map((seq) => {
      const steps = Array.isArray(seq.sequence_steps)
        ? [...seq.sequence_steps].sort((a, b) => (a.step_order ?? 1) - (b.step_order ?? 1))
        : []
      return {
        id: seq.id,
        name: seq.name,
        status: seq.status || 'active',
        description: seq.description || seq.pain || '',
        pain: seq.pain || '',
        targeting: seq.targeting || '',
        angleType: seq.segment_key || 'pain-point',
        leadCount: leads.length || seq.estimated_volume || 50,
        steps: steps.map((s) => ({
          id: s.id,
          stepOrder: s.step_order,
          delayDays: s.delay_days,
          subject: s.subject_template || 'scaling new buyers',
          body: s.body_template || '',
        })),
      }
    })

    const drafts: Record<string, { subject: string; body: string }> = {}
    for (const d of savedDrafts ?? []) {
      const lead = leads.find((l) => l.id === d.contact_id)
      const key = `${d.contact_id}:${d.sequence_id}`
      drafts[key] = {
        subject: d.subject || '',
        body: tokenizeLeadMentions(d.body || '', lead),
      }
    }

    return Response.json({
      companyName: company.name || 'Apsurn',
      campaigns,
      leads,
      drafts,
    })
  } catch {
    return Response.json({ companyName: 'Apsurn', campaigns: [], leads: [], drafts: {} })
  }
}

const patchSchema = z.object({
  id: z.string(),
  status: z.enum(['active', 'paused', 'draft']).optional(),
  name: z.string().min(1).max(120).optional(),
})

export async function PATCH(req: Request) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid update' }, { status: 400 })

  try {
    const userId = await getCurrentUserId()
    const supabase = createAdminClient()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (parsed.data.status) updates.status = parsed.data.status
    if (parsed.data.name) updates.name = parsed.data.name.trim()

    const { error } = await supabase
      .from('sequences')
      .update(updates)
      .eq('id', parsed.data.id)
      .eq('user_id', userId)

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(400).optional(),
})

export async function POST(req: Request) {
  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Please enter a campaign name' }, { status: 400 })

  try {
    const userId = await getCurrentUserId()
    const supabase = createAdminClient()
    const { data: company } = await supabase
      .from('companies')
      .select('id, name')
      .eq('user_id', userId)
      .maybeSingle()

    if (!company?.id) return Response.json({ error: 'Run setup first' }, { status: 400 })

    const defaultBody = `Hi {{first_name}} ,\n\nFor a {{title}} at a growing company like {{company}} , scaling beyond early traction means finding new buyers consistently, often without adding a full internal team.\n\nWe handle that entire process for B2B companies, delivering qualified opportunities each month without you needing to manage tools or SDRs.\n\nIs this something on your radar at {{company}} , or am I off base?\n\nBest,\n${company.name || 'Team'}`

    const { data: seq, error } = await supabase
      .from('sequences')
      .insert({
        user_id: userId,
        company_id: company.id,
        name: parsed.data.name.trim(),
        status: 'active',
        description: parsed.data.description?.trim() || 'Personalized outbound sequence for ICP decision-makers.',
        pain: parsed.data.description?.trim() || '',
        targeting: 'Decision Makers · ICP Accounts',
        estimated_volume: 50,
        segment_key: 'pain-point',
      })
      .select('id')
      .single()

    if (error || !seq) return Response.json({ error: error?.message || 'Failed to create campaign' }, { status: 500 })

    await supabase.from('sequence_steps').insert({
      sequence_id: seq.id,
      step_order: 1,
      delay_days: 0,
      subject_template: 'scaling new buyers',
      body_template: defaultBody,
      stop_on_reply: true,
    })

    return Response.json({ id: seq.id })
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
