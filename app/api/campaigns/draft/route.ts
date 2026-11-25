import { z } from 'zod'
import { createVertexClient, getVertexModel, isVertexConfigured } from '@/lib/ai/vertex'
import { getCurrentUserId } from '@/lib/auth/session'
import { creditCost, getBillingState, spendCredits } from '@/lib/billing/credits'
import { COLD_EMAIL_PLAYBOOK, formatEmailBody } from '@/lib/outreach/copywriting'
import { tokenizeLeadMentions } from '@/lib/outreach/merge-fields'
import { createAdminClient } from '@/lib/supabase/admin'

const draftBodySchema = z.object({
  campaignId: z.string(),
  campaignName: z.string(),
  campaignDescription: z.string().optional(),
  senderCompanyName: z.string().optional(),
  lead: z.object({
    id: z.string(),
    fullName: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    companyName: z.string().nullable().optional(),
    companyDomain: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    outreachAngle: z.string().nullable().optional(),
  }),
})

export async function POST(req: Request) {
  const parsed = draftBodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid draft request' }, { status: 400 })
  const { campaignId, campaignName, campaignDescription, senderCompanyName = 'Apsurn', lead } = parsed.data

  const firstName = (lead.fullName ?? '').trim().split(/\s+/)[0] || 'there'
  const role = lead.title || 'Founder'
  const company = lead.companyName || 'your company'

  let subject = 'scaling new buyers'
  let body = `Hi {{first_name}} ,\n\nFor a {{title}} at a growing company like {{company}} , scaling beyond early traction means finding new buyers consistently, often without adding a full internal team.\n\nWe handle that entire process for B2B SaaS companies, delivering qualified meetings each month without you needing to manage tools or SDRs.\n\nIs this something on your radar at {{company}} , or am I off base?\n\nBest,\n${senderCompanyName}`

  // AI drafts are a paid feature (1 credit). Everyone else gets the free template below.
  let canUseAI = false
  let draftUserId: string | null = null
  try {
    draftUserId = await getCurrentUserId()
    const billing = await getBillingState(draftUserId)
    canUseAI = billing.active && billing.credits >= creditCost('email_draft')
  } catch {
    canUseAI = false
  }
  let aiUsed = false

  if (isVertexConfigured() && canUseAI) {
    try {
      const client = createVertexClient()
      const model = getVertexModel()
      const response = await client.models.generateContent({
        model,
        contents: `You are an elite B2B cold email copywriter. Write one first-touch cold email for this campaign and recipient.

${COLD_EMAIL_PLAYBOOK}

CONTEXT
Sender Company: ${senderCompanyName}
Campaign Name: ${campaignName}
Campaign Angle: ${campaignDescription || 'Helping growing B2B teams find qualified buyers'}
Recipient Name: ${firstName} (${lead.fullName})
Recipient Title: ${role}
Recipient Company: ${company} (${lead.companyDomain || ''})
Recipient Industry: ${lead.industry || 'B2B'}
Specific Angle: ${lead.outreachAngle || ''}

Use the tokens {{first_name}}, {{title}} and {{company}} for the recipient's details. Sign off as the team at ${senderCompanyName}.
Return JSON: {"subject": string, "body": string}. The body must contain real paragraph breaks: a blank line between paragraphs, written as \\n\\n inside the JSON string.`,
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
          temperature: 0.3,
        },
      })

      if (response.text) {
        const json = JSON.parse(response.text) as { subject?: string; body?: string }
        if (json.subject) subject = json.subject.trim()
        if (json.body) body = tokenizeLeadMentions(formatEmailBody(json.body), lead)
        aiUsed = true
      }
    } catch (err) {
      console.warn('[campaigns/draft] AI fallback used:', err)
    }
  }

  // Persist to outreach_drafts in Supabase if authenticated
  try {
    const userId = await getCurrentUserId()
    const supabase = createAdminClient()
    await supabase.from('outreach_drafts').delete().eq('user_id', userId).eq('contact_id', lead.id).eq('sequence_id', campaignId)
    await supabase.from('outreach_drafts').insert({
      user_id: userId,
      contact_id: lead.id,
      sequence_id: campaignId,
      subject,
      body,
      source: 'ai',
    })
  } catch {
    // ignore if guest/local
  }

  if (aiUsed && draftUserId) await spendCredits(draftUserId, creditCost('email_draft'), 'email_draft')

  return Response.json({ subject, body, ai: aiUsed, upgradeRequired: !canUseAI })
}

const patchDraftSchema = z.object({
  campaignId: z.string(),
  contactId: z.string(),
  subject: z.string(),
  body: z.string(),
})

export async function PATCH(req: Request) {
  const parsed = patchDraftSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid draft update' }, { status: 400 })
  const { campaignId, contactId, subject, body } = parsed.data

  try {
    const userId = await getCurrentUserId()
    const supabase = createAdminClient()
    await supabase.from('outreach_drafts').delete().eq('user_id', userId).eq('contact_id', contactId).eq('sequence_id', campaignId)
    await supabase.from('outreach_drafts').insert({
      user_id: userId,
      contact_id: contactId,
      sequence_id: campaignId,
      subject,
      body,
      source: 'user',
    })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false })
  }
}
