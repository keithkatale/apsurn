import { z } from 'zod'
import { analyzeBusiness } from '@/lib/ai'
import { getCurrentUserId } from '@/lib/auth/session'
import { scrapeBusinessSite } from '@/lib/scrape-site'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AnalyzeResponse } from '@/lib/types'

export const maxDuration = 60

const bodySchema = z.object({ url: z.string().min(3).max(500) })

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Please provide a valid URL' }, { status: 400 })

  let site: Awaited<ReturnType<typeof scrapeBusinessSite>>
  try {
    site = await scrapeBusinessSite(parsed.data.url)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return Response.json({ error: `Could not read that website: ${message}` }, { status: 422 })
  }

  if (site.pages[0].text.length < 80 && !site.meta.description) {
    return Response.json(
      { error: 'That site renders almost no readable text (it may be fully client-side rendered or blocking bots).' },
      { status: 422 },
    )
  }

  try {
    const profile = await analyzeBusiness(site)
    const pagesRead = site.pages.map((p) => p.url)
    let companyId: string | undefined

    // Persist company & blueprint to Supabase if user / guest session is active
    try {
      const userId = await getCurrentUserId()
      const supabase = createAdminClient()
      const { data: company } = await supabase
        .from('companies')
        .upsert(
          {
            user_id: userId,
            website_url: site.url,
            name: profile.companyName,
            status: 'ready',
          },
          { onConflict: 'user_id' },
        )
        .select('id')
        .single()

      if (company?.id) {
        companyId = company.id
        await supabase.from('company_blueprints').upsert(
          {
            company_id: company.id,
            raw_scrape: { rootUrl: site.url, pagesRead },
            profile,
            icp: {
              industries: profile.icp.industries,
              companySizeRange: profile.icp.companySize,
              geographies: profile.icp.geographies,
              budgetSignals: profile.icp.buyingTriggers,
            },
            personas: profile.icp.buyerPersonas.map((title) => ({
              title,
              seniority: 'decision_maker',
              painPoints: profile.icp.painPoints,
              goals: profile.keyFeatures,
            })),
            value_prop: profile.valueProposition,
            positioning: `${profile.category} — ${profile.oneLiner}`,
            product_summary: profile.oneLiner,
            competitors: profile.competitors,
            confidence: 'model',
            model_used: 'vertex',
            generated_at: new Date().toISOString(),
          },
          { onConflict: 'company_id' },
        )
      }
    } catch {
      // Continue even if unauthenticated
    }

    const body: AnalyzeResponse = { url: site.url, companyId, profile, pagesRead }
    return Response.json(body)
  } catch (error) {
    console.error('[analyze] AI error', error)
    return Response.json({ error: 'AI analysis failed. Please try again.' }, { status: 500 })
  }
}
