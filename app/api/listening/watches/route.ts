import { z } from 'zod'
import { authErrorResponse, getListeningContext } from '@/lib/listening/context'

const MAX_WATCHES = 25

const addSchema = z.object({
  kind: z.enum(['keyword', 'competitor']).default('keyword'),
  query: z.string().trim().min(2).max(80),
})
const patchSchema = z.object({ id: z.string().uuid(), active: z.boolean() })
const deleteSchema = z.object({ id: z.string().uuid() })

export async function POST(req: Request) {
  const parsed = addSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Enter a phrase of 2-80 characters.' }, { status: 400 })
  try {
    const { userId, companyId, supabase } = await getListeningContext()
    const { count } = await supabase
      .from('listening_watches')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    if ((count ?? 0) >= MAX_WATCHES) {
      return Response.json({ error: `You can track up to ${MAX_WATCHES} things.` }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('listening_watches')
      .upsert({ ...parsed.data, user_id: userId, company_id: companyId }, { onConflict: 'user_id,kind,query' })
      .select('id, kind, query, sources, frequency, active, last_scanned_at')
      .single()
    if (error) throw new Error(error.message)
    return Response.json({ watch: data })
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: 'Could not add that.' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 })
  try {
    const { userId, supabase } = await getListeningContext()
    await supabase.from('listening_watches').update({ active: parsed.data.active }).eq('id', parsed.data.id).eq('user_id', userId)
    return Response.json({ ok: true })
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: 'Could not update.' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 })
  try {
    const { userId, supabase } = await getListeningContext()
    await supabase.from('listening_watches').delete().eq('id', parsed.data.id).eq('user_id', userId)
    return Response.json({ ok: true })
  } catch (error) {
    return authErrorResponse(error) ?? Response.json({ error: 'Could not remove.' }, { status: 500 })
  }
}
