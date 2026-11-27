import { creditCost, getBillingState } from '@/lib/billing/credits'
import { authErrorResponse, defaultWatches, getListeningContext, isMissingTable } from '@/lib/listening/context'
import { FREE_SIGNAL_CAP } from '@/lib/listening/pipeline'

/** Feed + watches + status for the Signals page. Seeds default watches from the business profile on first load. */
export async function GET() {
  try {
    const { userId, companyId, profile, supabase } = await getListeningContext()

    const columns = 'id, kind, query, sources, frequency, active, last_scanned_at'
    const firstLoad = await supabase
      .from('listening_watches')
      .select(columns)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    const migrationRequired = isMissingTable(firstLoad.error)
    let watches = firstLoad.data

    // First visit: the tags come from the business blueprint (its buying-intent phrases and competitors).
    if (!watches?.length && profile && !migrationRequired) {
      await supabase
        .from('listening_watches')
        .upsert(
          defaultWatches(profile).map((w) => ({ ...w, user_id: userId, company_id: companyId })),
          { onConflict: 'user_id,kind,query', ignoreDuplicates: true },
        )
      const seeded = await supabase
        .from('listening_watches')
        .select(columns)
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      watches = seeded.data
    }

    // If the table is not available yet, still show the blueprint tags so the tab is never empty.
    const preview = !watches?.length && profile
    if (preview) {
      watches = defaultWatches(profile).map((w, i) => ({
        id: `blueprint-${i}`,
        kind: w.kind,
        query: w.query,
        sources: [],
        frequency: 'daily',
        active: true,
        last_scanned_at: null,
      }))
    }

    const { data: signals } = await supabase
      .from('signals')
      .select(
        'id, source, url, author, author_headline, community, title, text, posted_at, signal_type, score, icp_fit, reason, outreach_angle, status, matched_query, created_at',
      )
      .eq('user_id', userId)
      .neq('status', 'dismissed')
      .order('score', { ascending: false })
      .order('posted_at', { ascending: false })
      .limit(200)

    const { data: lastRun } = await supabase
      .from('scan_runs')
      .select('status, items_found, items_kept, credits_charged, error, finished_at')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const billing = await getBillingState(userId).catch(() => null)
    return Response.json({
      hasProfile: Boolean(profile),
      watchesFromBlueprintOnly: Boolean(preview),
      migrationRequired,
      watches: watches ?? [],
      signals: signals ?? [],
      lastRun: lastRun ?? null,
      billing: {
        active: billing?.active ?? false,
        credits: billing?.credits ?? 0,
        scanCost: creditCost('lead_source_scan'),
        signalCost: creditCost('signal_kept'),
        freeCap: FREE_SIGNAL_CAP,
      },
    })
  } catch (error) {
    const auth = authErrorResponse(error)
    if (auth) return auth
    console.error('[listening] GET failed', error)
    return Response.json({ error: 'Could not load signals.' }, { status: 500 })
  }
}
