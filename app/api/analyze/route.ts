import { z } from 'zod'
import { analyzeBusiness } from '@/lib/ai'
import { scrapeBusinessSite } from '@/lib/scrape-site'
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
    const body: AnalyzeResponse = { url: site.url, profile, pagesRead: site.pages.map((p) => p.url) }
    return Response.json(body)
  } catch (error) {
    console.error('[analyze] AI error', error)
    return Response.json({ error: 'AI analysis failed. Please try again.' }, { status: 500 })
  }
}
