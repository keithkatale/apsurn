import { z } from 'zod'
import { analyzeCompetitorsAndPositioning } from '@/lib/ai'
import { getCurrentUserId } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { businessProfileSchema } from '@/lib/types'

export const maxDuration = 60

const bodySchema = z.object({
  url: z.string().min(3),
  companyId: z.string().optional(),
  profile: businessProfileSchema,
})

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid competitor analysis request' }, { status: 400 })

  try {
    const result = await analyzeCompetitorsAndPositioning({
      url: parsed.data.url,
      profile: parsed.data.profile,
    })

    // Persist competitor analysis to Supabase if session is active
    try {
      const userId = await getCurrentUserId()
      const supabase = createAdminClient()
      const { data: company } = parsed.data.companyId
        ? { data: { id: parsed.data.companyId } }
        : await supabase.from('companies').select('id').eq('user_id', userId).maybeSingle()

      if (company?.id) {
        const { data: existing } = await supabase
          .from('company_blueprints')
          .select('raw_scrape')
          .eq('company_id', company.id)
          .maybeSingle()

        await supabase
          .from('company_blueprints')
          .update({
            competitors: result.competitors.map((c) => c.name),
            raw_scrape: {
              ...((existing?.raw_scrape as Record<string, unknown>) ?? {}),
              competitorAnalysis: result,
            },
            approved_at: new Date().toISOString(),
          })
          .eq('company_id', company.id)
      }
    } catch {
      // Ignore persistence errors for anonymous visitors
    }

    return Response.json(result)
  } catch (error) {
    console.error('[setup/competitors] error', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Competitor analysis failed' },
      { status: 500 },
    )
  }
}
