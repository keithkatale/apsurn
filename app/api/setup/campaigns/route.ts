import { z } from 'zod'
import { generateCampaigns } from '@/lib/ai'
import { getCurrentUserId } from '@/lib/auth/session'
import { logEvent } from '@/lib/events'
import { beginSetupAction, settleSetupAction } from '@/lib/billing/gate'
import { createAdminClient } from '@/lib/supabase/admin'
import { businessProfileSchema, competitorAnalysisSchema, type CampaignsResponse, type GeneratedCampaign } from '@/lib/types'

export const maxDuration = 60

const bodySchema = z.object({
  companyId: z.string().optional(),
  profile: businessProfileSchema,
  positioning: competitorAnalysisSchema.shape.positioningStrategy.optional().nullable(),
  competitors: z.array(z.string()).optional(),
  leadsCount: z.number().int().optional(),
})

function normalizeMergeTags(text: string): string {
  return text
    .replace(/\{\{\s*firstName\s*\}\}/gi, '{{first_name}}')
    .replace(/\{\{\s*fullName\s*\}\}/gi, '{{full_name}}')
    .replace(/\{\{\s*companyName\s*\}\}/gi, '{{company}}')
    .replace(/\{\{\s*company_name\s*\}\}/gi, '{{company}}')
    .replace(/\{\{\s*jobTitle\s*\}\}/gi, '{{title}}')
}

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid campaign generation request' }, { status: 400 })

  const gate = await beginSetupAction('campaign_generate')
  if (gate.blocked) return gate.blocked

  try {
    const rawCampaigns = await generateCampaigns({
      profile: parsed.data.profile,
      positioning: parsed.data.positioning,
      competitors: parsed.data.competitors ?? parsed.data.profile.competitors,
      leadsCount: parsed.data.leadsCount ?? 50,
    })

    const savedCampaigns: GeneratedCampaign[] = []

    // Persist generated campaigns & multi-step sequences to Supabase and enroll contacts
    try {
      const userId = await getCurrentUserId()
      const supabase = createAdminClient()
      const { data: company } = parsed.data.companyId
        ? { data: { id: parsed.data.companyId } }
        : await supabase.from('companies').select('id').eq('user_id', userId).maybeSingle()

      if (company?.id) {
        // Remove previous setup sequences for this company to avoid duplicates
        await supabase.from('sequences').delete().eq('company_id', company.id)

        // Find all contacts belonging to this company's prospect_companies
        const { data: prospectCos } = await supabase
          .from('prospect_companies')
          .select('id, contacts!contacts_prospect_company_id_fkey(id)')
          .eq('company_id', company.id)
          .limit(60)

        const contactIds = (prospectCos ?? []).flatMap((co) =>
          Array.isArray(co.contacts) ? co.contacts.map((c: { id: string }) => c.id) : [],
        )

        for (let idx = 0; idx < rawCampaigns.length; idx++) {
          const campaign = rawCampaigns[idx]
          const normalizedSteps = campaign.sequence.map((step) => ({
            ...step,
            subject: normalizeMergeTags(step.subject),
            body: normalizeMergeTags(step.body),
          }))

          const { data: seq } = await supabase
            .from('sequences')
            .insert({
              user_id: userId,
              company_id: company.id,
              name: campaign.name,
              status: idx < 2 ? 'active' : 'draft',
              description: campaign.positioningHook,
              pain: campaign.whyItWorks,
              targeting: `${campaign.targetPersona} · ${campaign.targetSegment}`,
              estimated_volume: contactIds.length || (campaign.matchedLeadCount ?? 50),
              segment_key: campaign.angleType,
            })
            .select('id')
            .single()

          if (seq?.id) {
            if (normalizedSteps.length > 0) {
              await supabase.from('sequence_steps').insert(
                normalizedSteps.map((step) => ({
                  sequence_id: seq.id,
                  step_order: step.stepNumber,
                  delay_days: step.delayDays,
                  subject_template: step.subject,
                  body_template: step.body,
                  stop_on_reply: true,
                })),
              )
            }

            if (contactIds.length > 0) {
              await supabase.from('enrollments').insert(
                contactIds.map((contactId) => ({
                  sequence_id: seq.id,
                  contact_id: contactId,
                  status: 'active',
                  current_step: 1,
                })),
              )
            }

            savedCampaigns.push({
              ...campaign,
              id: seq.id,
              matchedLeadCount: contactIds.length || campaign.matchedLeadCount,
              sequence: normalizedSteps,
            })
          } else {
            savedCampaigns.push({ ...campaign, sequence: normalizedSteps })
          }
        }
      }
    } catch (dbErr) {
      console.warn('[setup/campaigns] DB persistence warning:', dbErr)
    }

    await settleSetupAction(gate, 'campaign_generate')
    await logEvent('campaigns_generated', { userId: gate.userId ?? null, props: { count: savedCampaigns.length || rawCampaigns.length } })

    const body: CampaignsResponse = {
      campaigns: savedCampaigns.length > 0 ? savedCampaigns : rawCampaigns,
    }
    return Response.json(body)
  } catch (error) {
    console.error('[setup/campaigns] error', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to generate campaigns' },
      { status: 500 },
    )
  }
}
