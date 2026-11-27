import { z } from 'zod'
import { authErrorResponse, getListeningContext } from '@/lib/listening/context'

const bodySchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['save', 'dismiss', 'restore', 'to_lead']),
})

const LIST_NAME = 'Signals'

export async function PATCH(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 })
  const { id, action } = parsed.data

  try {
    const { userId, companyId, supabase } = await getListeningContext()
    const { data: signal } = await supabase.from('signals').select('*').eq('id', id).eq('user_id', userId).maybeSingle()
    if (!signal) return Response.json({ error: 'Signal not found.' }, { status: 404 })

    if (action !== 'to_lead') {
      const status = action === 'save' ? 'saved' : action === 'dismiss' ? 'dismissed' : 'new'
      await supabase.from('signals').update({ status }).eq('id', id).eq('user_id', userId)
      return Response.json({ ok: true, status })
    }

    if (signal.status === 'lead' && signal.prospect_company_id) {
      return Response.json({ ok: true, status: 'lead', prospectCompanyId: signal.prospect_company_id })
    }
    if (!companyId) return Response.json({ error: 'Finish setup first.' }, { status: 400 })

    // Reuse (or create) one "Signals" table so these leads stay together in the Leads workspace.
    const { data: lists } = await supabase
      .from('prospect_lists')
      .select('id')
      .eq('company_id', companyId)
      .eq('name', LIST_NAME)
      .limit(1)
    let listId: string | null = lists?.[0]?.id ?? null
    if (!listId) {
      const { data: created } = await supabase
        .from('prospect_lists')
        .insert({
          user_id: userId,
          company_id: companyId,
          name: LIST_NAME,
          criteria: { custom: true, from: 'signals' },
          status: 'completed',
          requested_count: 0,
          found_count: 0,
          completed_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      listId = created?.id ?? null
    }

    const accountName = (signal.company_name || signal.community || signal.author || 'Unknown account') as string
    const { data: account, error: accountError } = await supabase
      .from('prospect_companies')
      .insert({
        user_id: userId,
        company_id: companyId,
        list_id: listId,
        name: accountName,
        domain: signal.domain,
        source: 'signal',
        source_ref: signal.source,
        icp_fit_score: signal.score,
        status: 'new',
        qualify_reason: signal.reason,
        outreach_angle: signal.outreach_angle,
        description: String(signal.text).slice(0, 500),
      })
      .select('id')
      .single()
    if (accountError || !account) throw new Error(accountError?.message ?? 'Could not create lead')

    await supabase.from('contacts').insert({
      prospect_company_id: account.id,
      full_name: signal.author || 'Unknown',
      title: signal.author_headline,
      email_status: 'unverified',
      source: 'signal',
      contact_origin: 'signal',
      lead_status: 'new',
      qualify_reason: signal.reason,
    })

    await supabase.from('signals').update({ status: 'lead', prospect_company_id: account.id }).eq('id', id).eq('user_id', userId)
    return Response.json({ ok: true, status: 'lead', prospectCompanyId: account.id })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    console.error('[listening/signals] failed', error)
    return Response.json({ error: 'Could not update that signal.' }, { status: 500 })
  }
}
