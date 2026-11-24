import { getCurrentUserId } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const userId = await getCurrentUserId()
    const supabase = createAdminClient()
    const { data: companies } = await supabase
      .from('prospect_companies')
      .select('id, name, domain, website_url, industry, location, country, icp_fit_score, status, qualify_reason, contacts(id, full_name, title, email, email_status, phone, linkedin_url, country, lead_status, qualify_reason)')
      .eq('user_id', userId)
      .order('icp_fit_score', { ascending: false })
      .limit(50)

    return Response.json({ companies: companies ?? [] })
  } catch {
    return Response.json({ companies: [] })
  }
}
