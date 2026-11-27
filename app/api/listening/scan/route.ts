import { rateLimit } from '@/lib/rate-limit'
import { authErrorResponse, defaultWatches, getListeningContext, isMissingTable, MIGRATION_MESSAGE } from '@/lib/listening/context'
import { runScan, type Watch } from '@/lib/listening/pipeline'

export const maxDuration = 120

export async function POST() {
  try {
    const { userId, companyId, profile, supabase } = await getListeningContext()
    if (!profile) {
      return Response.json({ error: 'Finish setup first so we know what to listen for.', code: 'no_profile' }, { status: 400 })
    }
    if (!rateLimit(`listening-scan:${userId}`, 6, 10 * 60 * 1000)) {
      return Response.json({ error: 'Too many scans. Try again in a few minutes.' }, { status: 429 })
    }

    const columns = 'id, kind, query, sources, active, last_scanned_at'
    const first = await supabase.from('listening_watches').select(columns).eq('user_id', userId).eq('active', true)
    if (isMissingTable(first.error)) {
      return Response.json({ error: MIGRATION_MESSAGE, code: 'migration_required' }, { status: 503 })
    }
    let watches = first.data
    if (!watches?.length) {
      const { count } = await supabase.from('listening_watches').select('id', { count: 'exact', head: true }).eq('user_id', userId)
      if (!count) {
        // Nothing saved yet: start from the business blueprint.
        await supabase
          .from('listening_watches')
          .upsert(
            defaultWatches(profile).map((w) => ({ ...w, user_id: userId, company_id: companyId })),
            { onConflict: 'user_id,kind,query', ignoreDuplicates: true },
          )
        watches = (await supabase.from('listening_watches').select(columns).eq('user_id', userId).eq('active', true)).data
      }
    }
    if (!watches?.length) {
      return Response.json({ error: 'Add at least one thing to listen for.', code: 'no_watches' }, { status: 400 })
    }

    const summary = await runScan({ userId, companyId, profile, watches: watches as Watch[] })
    return Response.json({ summary })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    console.error('[listening/scan] failed', error)
    return Response.json({ error: 'The scan failed. Please try again.' }, { status: 500 })
  }
}
