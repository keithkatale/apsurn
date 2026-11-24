import { z } from 'zod'
import { scorePosts } from '@/lib/ai'
import { createVertexClient, getVertexModel } from '@/lib/ai/vertex'
import { fetchApifyLeads } from '@/lib/apify-leads'
import { getCurrentUserId } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BusinessProfile, SeniorityId } from '@/lib/types'

export const maxDuration = 120

export type WorkspaceLead = {
  id: string
  contactId: string | null
  tableId: string | null
  fullName: string
  title: string
  companyName: string
  companyDomain: string
  companyWebsite: string | null
  email: string | null
  phone: string | null
  linkedinUrl: string | null
  location: string | null
  industry: string | null
  companySize: string | null
  whatTheyDo: string
  howWeCanHelp: string
  score: number
  status: string
  enriched: boolean
}

export type WorkspaceLeadTable = {
  id: string
  name: string
  leadCount: number
  createdAt: string
}

function cleanDomain(website?: string | null, email?: string | null): string {
  if (website) {
    const d = website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]?.trim()
    if (d) return d
  }
  if (email && email.includes('@')) {
    return email.split('@')[1].trim()
  }
  return ''
}

export type PartialLeadInput = {
  fullName?: string | null
  title?: string | null
  companyName?: string | null
  companyWebsite?: string | null
  companyDomain?: string | null
  email?: string | null
  phone?: string | null
  linkedinUrl?: string | null
  location?: string | null
  industry?: string | null
  companySize?: string | null
  whatTheyDo?: string | null
  howWeCanHelp?: string | null
}

async function analyzeLeadWithAI(
  input: PartialLeadInput,
  ourProfile?: BusinessProfile | null,
) {
  const rawFullName = (input.fullName || '').trim()
  const rawTitle = (input.title || '').trim()
  const rawCompanyName = (input.companyName || '').trim()
  const rawEmail = (input.email || '').trim()
  const rawPhone = (input.phone || '').trim()
  const rawLinkedin = (input.linkedinUrl || '').trim()
  const rawWebsite = (input.companyWebsite || '').trim()
  const rawLocation = (input.location || '').trim()
  const rawIndustry = (input.industry || '').trim()

  let domain = cleanDomain(rawWebsite, rawEmail)
  if (!domain && rawCompanyName) {
    domain = rawCompanyName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com'
  }

  // Quick live site sniff (up to 2.5s) if website or domain is present
  let websiteContext = ''
  const candidateUrl = rawWebsite || (domain ? `https://${domain}` : '')
  if (candidateUrl && candidateUrl.startsWith('http')) {
    try {
      const res = await fetch(candidateUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(2500),
      })
      if (res.ok) {
        const html = await res.text()
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? ''
        const descMatch =
          html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
          html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
          ''
        const snippet = html
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .slice(0, 600)
          .trim()
        websiteContext = [titleMatch, descMatch, snippet].filter(Boolean).join(' | ')
      }
    } catch {
      // Non-blocking fallback
    }
  }

  try {
    const ai = createVertexClient()
    const prompt = `You are an elite B2B sales intelligence engine. A user manually added or uploaded a lead with partial information:
- Full Name: ${rawFullName || '(not provided)'}
- Job Title: ${rawTitle || '(not provided)'}
- Company Name: ${rawCompanyName || '(not provided)'}
- Website: ${candidateUrl || '(not provided)'}
- Domain: ${domain || '(not provided)'}
- LinkedIn: ${rawLinkedin || '(not provided)'}
- Email: ${rawEmail || '(not provided)'}
- Location: ${rawLocation || '(not provided)'}
- Industry: ${rawIndustry || '(not provided)'}
${websiteContext ? `- Website Snippet: ${websiteContext}` : ''}
${ourProfile?.oneLiner ? `- Our Solution Context: ${ourProfile.oneLiner}` : ''}

TASK:
Analyze all the provided clues (website URL, domain, company name, LinkedIn profile handle, email pattern, etc.).
Fill in ALL missing fields with realistic, high-quality, professional B2B intelligence:

1. "fullName": If provided, keep it. If missing, infer from the LinkedIn URL or email address.
2. "title": If missing or generic (like 'Executive'), determine the exact likely executive title (e.g. "Founder & CEO", "VP of Sales", "Head of Engineering", "Chief Technology Officer").
3. "companyName": Clean company name (e.g. "Plain", "Stripe", "Acme").
4. "companyDomain": Clean root domain (e.g. "plain.com").
5. "companyWebsite": Valid https:// URL (e.g. "https://plain.com").
6. "industry": Professional B2B category (e.g. "B2B SaaS", "Developer Tools", "Fintech", "Cybersecurity", "HealthTech", etc.).
7. "location": City and Country or State (e.g. "San Francisco, CA, US", "London, UK", "New York, US").
8. "companySize": Estimated employee count bracket (e.g. "1-10", "11-50", "51-200", "201-500", "500+").
9. "whatTheyDo": Crisp, accurate 1-2 sentence description of what the company builds, sells, or solves.
10. "howWeCanHelp": Actionable 1-2 sentence outreach angle explaining how an automated GTM and pipeline platform helps them book qualified meetings and grow revenue.
11. "email": If provided, keep it. If missing and we have name + domain, infer probable work email (e.g. firstname@domain or firstname.lastname@domain).
12. "score": Realistic ICP fit score (number between 75 and 95).

Return strict JSON only matching this schema:
{
  "fullName": string,
  "title": string,
  "companyName": string,
  "companyDomain": string,
  "companyWebsite": string,
  "industry": string,
  "location": string,
  "companySize": string,
  "whatTheyDo": string,
  "howWeCanHelp": string,
  "email": string | null,
  "score": number
}`

    const response = await ai.models.generateContent({
      model: getVertexModel(),
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    })

    const parsed = JSON.parse(response.text || '{}') as Record<string, unknown>

    return {
      fullName: rawFullName || String(parsed.fullName || 'Decision Maker'),
      title:
        rawTitle && rawTitle !== 'Executive' ? rawTitle : String(parsed.title || 'Founder & CEO'),
      companyName: rawCompanyName || String(parsed.companyName || 'Company'),
      companyDomain: domain || String(parsed.companyDomain || 'company.com'),
      companyWebsite:
        rawWebsite || String(parsed.companyWebsite || (domain ? `https://${domain}` : '')),
      industry:
        rawIndustry && rawIndustry !== 'B2B Software' && rawIndustry !== 'B2B SaaS'
          ? rawIndustry
          : String(parsed.industry || 'B2B Software'),
      location:
        rawLocation && rawLocation !== 'United States'
          ? rawLocation
          : String(parsed.location || 'United States'),
      companySize: String(parsed.companySize || '11-50'),
      whatTheyDo: String(parsed.whatTheyDo || `${rawCompanyName || 'Company'} B2B operations.`),
      howWeCanHelp: String(
        parsed.howWeCanHelp ||
          `Help ${rawCompanyName || 'Company'} accelerate outbound pipeline and book qualified meetings.`,
      ),
      email:
        rawEmail ||
        (typeof parsed.email === 'string' && parsed.email.includes('@') ? parsed.email : null),
      phone: rawPhone || null,
      linkedinUrl: rawLinkedin || null,
      score: typeof parsed.score === 'number' ? parsed.score : 85,
    }
  } catch (err) {
    console.warn('[ai/lead-enrich] Falling back to heuristic lead fields:', err)
    return {
      fullName: rawFullName || 'Decision Maker',
      title: rawTitle || 'Executive',
      companyName: rawCompanyName || 'Company',
      companyDomain: domain || 'company.com',
      companyWebsite: rawWebsite || (domain ? `https://${domain}` : null),
      industry: rawIndustry || 'B2B Software',
      location: rawLocation || 'United States',
      companySize: '11-50',
      whatTheyDo: `${rawCompanyName || 'Company'} B2B technology operations.`,
      howWeCanHelp: `Help ${rawCompanyName || 'Company'} accelerate outbound pipeline and book qualified meetings.`,
      email: rawEmail || null,
      phone: rawPhone || null,
      linkedinUrl: rawLinkedin || null,
      score: 82,
    }
  }
}

export async function GET() {
  try {
    const userId = await getCurrentUserId()
    const supabase = createAdminClient()

    const { data: company } = await supabase
      .from('companies')
      .select('id, name, website_url')
      .eq('user_id', userId)
      .maybeSingle()

    if (!company?.id) {
      return Response.json({
        companyName: 'Apsurn',
        companyWebsite: '',
        companyId: null,
        profile: null,
        tables: [],
        leads: [],
      })
    }

    const [{ data: lists }, { data: prospectCos }, { data: blueprint }] = await Promise.all([
      supabase
        .from('prospect_lists')
        .select('id, name, found_count, created_at')
        .eq('company_id', company.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('prospect_companies')
        .select(
          'id, list_id, name, domain, website_url, industry, employee_range, location, country, source_ref, icp_fit_score, status, qualify_reason, outreach_angle, description, created_at, contacts!contacts_prospect_company_id_fkey(id, full_name, title, email, phone, linkedin_url, country)',
        )
        .eq('company_id', company.id)
        .order('icp_fit_score', { ascending: false })
        .limit(500),
      supabase
        .from('company_blueprints')
        .select('profile')
        .eq('company_id', company.id)
        .maybeSingle(),
    ])

    // Helper to determine if a list is a setup-generated list vs a user-created custom table
    const isSetupListName = (name: string) => {
      const lower = name.toLowerCase().trim()
      return (
        lower === 'all leads' ||
        lower === 'primary leads' ||
        lower === 'primary icp leads' ||
        lower.includes('first 50') ||
        lower.includes('setup') ||
        lower.includes('primary')
      )
    }

    const rawLists = lists ?? []

    // 1. Separate setup lists from custom user-created lists
    const setupLists = rawLists.filter((l) => isSetupListName(l.name))
    const customLists = rawLists.filter((l) => !isSetupListName(l.name))

    // 2. Identify the single primary list for all setup leads
    let primaryList =
      setupLists.find((l) => l.name.includes('Primary') || l.name.includes('First 50')) ||
      setupLists[0] ||
      rawLists[0] ||
      null

    if (!primaryList && company.id) {
      const { data: createdPrimary } = await supabase
        .from('prospect_lists')
        .insert({
          user_id: userId,
          company_id: company.id,
          name: `${company.name || 'Primary'} Leads`,
          status: 'completed',
          criteria: { is_primary: true },
        })
        .select('id, name, created_at')
        .single()
      if (createdPrimary) primaryList = createdPrimary
    }

    const primaryListId = primaryList?.id || null

    // 3. Consolidate: If there are duplicate or ghost setup lists, clean them up!
    const redundantSetupListIds = setupLists
      .filter((l) => l.id !== primaryListId)
      .map((l) => l.id)

    if (redundantSetupListIds.length > 0 && primaryListId) {
      // Reassign all prospect_companies in redundant setup lists to the primary list
      await supabase
        .from('prospect_companies')
        .update({ list_id: primaryListId })
        .in('list_id', redundantSetupListIds)
        .eq('company_id', company.id)

      // Delete the redundant duplicate lists from prospect_lists
      await supabase
        .from('prospect_lists')
        .delete()
        .in('id', redundantSetupListIds)
        .eq('company_id', company.id)
    }

    // Also reassign any prospect_companies with null list_id to primaryListId
    if (primaryListId) {
      await supabase
        .from('prospect_companies')
        .update({ list_id: primaryListId })
        .is('list_id', null)
        .eq('company_id', company.id)
    }

    const validCustomIds = new Set(customLists.map((l) => l.id))

    const leads: WorkspaceLead[] = (prospectCos ?? []).map((co) => {
      const contact = Array.isArray(co.contacts) && co.contacts.length > 0 ? co.contacts[0] : null
      const email = contact?.email || null
      const website = co.website_url || (co.domain ? `https://${co.domain}` : null)
      const domain = co.domain || cleanDomain(website, email)
      const tableId = co.list_id && validCustomIds.has(co.list_id) ? co.list_id : primaryListId
      return {
        id: co.id,
        contactId: contact?.id || null,
        tableId,
        fullName: contact?.full_name || co.name || 'Decision Maker',
        title: contact?.title || 'Founder',
        companyName: co.name || 'Company',
        companyDomain: domain,
        companyWebsite: website,
        email,
        phone: contact?.phone || null,
        linkedinUrl: contact?.linkedin_url || null,
        location: contact?.country || co.location || co.country || null,
        industry: co.industry || null,
        companySize: co.employee_range || null,
        whatTheyDo: co.description || co.industry || 'B2B Technology & Services',
        howWeCanHelp: co.outreach_angle || co.qualify_reason || 'Strong ICP fit for outbound workflow.',
        score: co.icp_fit_score ?? 82,
        status: co.status || 'new',
        enriched: co.source_ref === 'ai_enriched',
      }
    })

    const countByList = new Map<string, number>()
    for (const l of leads) {
      if (l.tableId) {
        countByList.set(l.tableId, (countByList.get(l.tableId) ?? 0) + 1)
      }
    }

    const tables: WorkspaceLeadTable[] = []

    if (primaryList) {
      tables.push({
        id: primaryList.id,
        name: primaryList.name.toLowerCase().includes('all leads')
          ? `${company.name || 'Primary'} Leads`
          : primaryList.name,
        leadCount: countByList.get(primaryList.id) ?? leads.length,
        createdAt: primaryList.created_at,
      })
    }

    for (const cList of customLists) {
      tables.push({
        id: cList.id,
        name: cList.name,
        leadCount: countByList.get(cList.id) ?? 0,
        createdAt: cList.created_at,
      })
    }

    const savedProfile = (blueprint?.profile as BusinessProfile | undefined) ?? null

    return Response.json({
      companyName: company.name || 'Apsurn',
      companyWebsite: company.website_url || '',
      companyId: company.id,
      profile: savedProfile,
      tables,
      leads,
    })
  } catch (err) {
    console.error('[api/leads GET]', err)
    return Response.json({
      companyName: 'Apsurn',
      companyWebsite: '',
      companyId: null,
      profile: null,
      tables: [],
      leads: [],
    })
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action || '')
    const userId = await getCurrentUserId()
    const supabase = createAdminClient()

    let { data: company } = await supabase
      .from('companies')
      .select('id, name, website_url')
      .eq('user_id', userId)
      .maybeSingle()

    if (!company?.id) {
      const { data: createdCo } = await supabase
        .from('companies')
        .insert({
          user_id: userId,
          name: 'My Workspace',
          website_url: 'https://apsurn.com',
        })
        .select('id, name, website_url')
        .single()
      company = createdCo
    }

    if (!company?.id) {
      return Response.json({ error: 'Workspace not initialized' }, { status: 400 })
    }

    const { data: blueprintRow } = await supabase
      .from('company_blueprints')
      .select('profile')
      .eq('company_id', company.id)
      .maybeSingle()

    // ------------------------------------------------------------------------
    // 1. CREATE TABLE (Group)
    // ------------------------------------------------------------------------
    if (action === 'create_table') {
      const name = String(body.name || '').trim()
      if (!name) return Response.json({ error: 'Table name is required' }, { status: 400 })
      const leadIds = Array.isArray(body.leadIds) ? body.leadIds.map(String) : []

      const { data: createdList, error } = await supabase
        .from('prospect_lists')
        .insert({
          user_id: userId,
          company_id: company.id,
          name,
          criteria: { custom: true },
          status: 'completed',
          requested_count: leadIds.length,
          found_count: leadIds.length,
          completed_at: new Date().toISOString(),
        })
        .select('id, name, created_at')
        .single()

      if (error || !createdList) {
        return Response.json({ error: error?.message || 'Failed to create table' }, { status: 500 })
      }

      if (leadIds.length > 0) {
        await supabase
          .from('prospect_companies')
          .update({ list_id: createdList.id })
          .in('id', leadIds)
          .eq('company_id', company.id)
      }

      return Response.json({
        table: {
          id: createdList.id,
          name: createdList.name,
          leadCount: leadIds.length,
          createdAt: createdList.created_at,
        },
      })
    }

    // ------------------------------------------------------------------------
    // 2. ADD SINGLE LEAD MANUALLY (AI AUTO-ANALYZES & FILLS ALL MISSING FIELDS)
    // ------------------------------------------------------------------------
    if (action === 'add_lead') {
      const savedProfile = (blueprintRow?.profile as BusinessProfile | undefined) ?? null
      const tableId = body.tableId && body.tableId !== 'all' ? String(body.tableId) : null
      const enriched = await analyzeLeadWithAI(body as PartialLeadInput, savedProfile)

      const { data: co, error: coErr } = await supabase
        .from('prospect_companies')
        .insert({
          user_id: userId,
          company_id: company.id,
          list_id: tableId,
          name: enriched.companyName,
          domain: enriched.companyDomain || null,
          website_url: enriched.companyWebsite || null,
          industry: enriched.industry,
          location: enriched.location,
          country: enriched.location,
          employee_range: enriched.companySize,
          source: 'manual_ai_enriched',
          source_ref: 'ai_enriched',
          icp_fit_score: enriched.score,
          status: 'new',
          qualify_reason: enriched.howWeCanHelp,
          outreach_angle: enriched.howWeCanHelp,
          description: enriched.whatTheyDo,
        })
        .select('id')
        .single()

      if (coErr || !co) {
        return Response.json({ error: coErr?.message || 'Failed to add lead' }, { status: 500 })
      }

      const { data: ct } = await supabase
        .from('contacts')
        .insert({
          prospect_company_id: co.id,
          full_name: enriched.fullName,
          title: enriched.title,
          email: enriched.email,
          email_status: enriched.email ? 'verified' : 'unverified',
          phone: enriched.phone,
          linkedin_url: enriched.linkedinUrl,
          country: enriched.location,
          source: 'manual_ai_enriched',
          contact_origin: 'manual',
          lead_status: 'new',
          qualify_reason: enriched.howWeCanHelp,
        })
        .select('id')
        .single()

      const createdLead: WorkspaceLead = {
        id: co.id,
        contactId: ct?.id || null,
        tableId,
        fullName: enriched.fullName,
        title: enriched.title,
        companyName: enriched.companyName,
        companyDomain: enriched.companyDomain,
        companyWebsite: enriched.companyWebsite,
        email: enriched.email,
        phone: enriched.phone,
        linkedinUrl: enriched.linkedinUrl,
        location: enriched.location,
        industry: enriched.industry,
        companySize: enriched.companySize,
        whatTheyDo: enriched.whatTheyDo,
        howWeCanHelp: enriched.howWeCanHelp,
        score: enriched.score,
        status: 'new',
        enriched: true,
      }

      return Response.json({ lead: createdLead })
    }

    // ------------------------------------------------------------------------
    // 2B. IMPORT MULTIPLE LEADS (CSV / BATCH WITH AI ANALYSIS & ENRICHMENT)
    // ------------------------------------------------------------------------
    if (action === 'import_leads') {
      const rawLeads = Array.isArray(body.leads) ? (body.leads as PartialLeadInput[]) : []
      if (rawLeads.length === 0) {
        return Response.json({ error: 'No leads provided for import' }, { status: 400 })
      }

      const savedProfile = (blueprintRow?.profile as BusinessProfile | undefined) ?? null
      const tableId = body.tableId && body.tableId !== 'all' ? String(body.tableId) : null
      const enrichedBatch = await Promise.all(
        rawLeads.slice(0, 50).map((l) => analyzeLeadWithAI(l, savedProfile)),
      )

      const createdLeads: WorkspaceLead[] = []

      for (const item of enrichedBatch) {
        const { data: co } = await supabase
          .from('prospect_companies')
          .insert({
            user_id: userId,
            company_id: company.id,
            list_id: tableId,
            name: item.companyName,
            domain: item.companyDomain || null,
            website_url: item.companyWebsite || null,
            industry: item.industry,
            location: item.location,
            country: item.location,
            employee_range: item.companySize,
            source: 'manual_ai_enriched',
            source_ref: 'ai_enriched',
            icp_fit_score: item.score,
            status: 'new',
            qualify_reason: item.howWeCanHelp,
            outreach_angle: item.howWeCanHelp,
            description: item.whatTheyDo,
          })
          .select('id')
          .single()

        if (!co) continue

        const { data: ct } = await supabase
          .from('contacts')
          .insert({
            prospect_company_id: co.id,
            full_name: item.fullName,
            title: item.title,
            email: item.email,
            email_status: item.email ? 'verified' : 'unverified',
            phone: item.phone,
            linkedin_url: item.linkedinUrl,
            country: item.location,
            source: 'manual_ai_enriched',
            contact_origin: 'manual',
            lead_status: 'new',
            qualify_reason: item.howWeCanHelp,
          })
          .select('id')
          .single()

        createdLeads.push({
          id: co.id,
          contactId: ct?.id || null,
          tableId,
          fullName: item.fullName,
          title: item.title,
          companyName: item.companyName,
          companyDomain: item.companyDomain,
          companyWebsite: item.companyWebsite,
          email: item.email,
          phone: item.phone,
          linkedinUrl: item.linkedinUrl,
          location: item.location,
          industry: item.industry,
          companySize: item.companySize,
          whatTheyDo: item.whatTheyDo,
          howWeCanHelp: item.howWeCanHelp,
          score: item.score,
          status: 'new',
          enriched: true,
        })
      }

      return Response.json({ leads: createdLeads })
    }

    // ------------------------------------------------------------------------
    // 3. GENERATE MORE LEADS VIA APIFY + AI SCORING
    // ------------------------------------------------------------------------
    if (action === 'generate_more') {
      const personTitle = Array.isArray(body.personTitle)
        ? body.personTitle.map(String).filter(Boolean)
        : ['Founder', 'CEO', 'VP of Sales', 'Head of Growth']
      const keywords = Array.isArray(body.keywords)
        ? body.keywords.map(String).filter(Boolean)
        : ['SaaS', 'B2B Software']
      const personCountry = Array.isArray(body.personCountry)
        ? body.personCountry.map(String).filter(Boolean)
        : ['United States']
      const count = Math.min(50, Math.max(5, Number(body.count) || 25))
      const seniority: SeniorityId[] = ['founder', 'c_suite', 'vp', 'head', 'director']
      const targetTableId = body.tableId && body.tableId !== 'all' ? String(body.tableId) : null
      const newTableName = body.newTableName ? String(body.newTableName).trim() : ''

      const savedProfile: BusinessProfile = (blueprintRow?.profile as BusinessProfile | undefined) ?? {
        companyName: company.name || 'Apsurn',
        oneLiner: 'AI GTM & Outbound Engine',
        category: 'B2B SaaS',
        businessModel: {
          type: 'B2B SaaS',
          revenueModel: 'Subscription',
          pricingSignals: 'Self-serve & team plans',
          salesMotion: 'Hybrid PLG + Outbound',
        },
        valueProposition:
          'Helps B2B companies identify high-intent accounts and launch personalized outbound campaigns.',
        keyFeatures: ['Automated lead discovery', 'Personalized outbound sequences'],
        icp: {
          summary: 'High-growth B2B companies',
          industries: keywords,
          companySize: '11-200 employees',
          geographies: personCountry,
          buyerPersonas: personTitle,
          painPoints: ['Scaling outbound pipeline', 'Finding verified decision-makers'],
          buyingTriggers: ['Hiring sales/growth roles', 'Launching new product'],
        },
        competitors: ['Apollo', 'Clay'],
        keywords,
        hashtags: ['#b2b', '#saas'],
      }

      const rawLeads = await fetchApifyLeads({
        personTitle,
        webKeywords: keywords,
        personCountry,
        seniority,
        totalResults: Math.max(count * 2, 50),
      })

      const sliced = rawLeads.slice(0, count)
      const scored = sliced.length ? await scorePosts(savedProfile, sliced) : []
      const sortedLeads = scored.sort((a, b) => b.score - a.score)

      let listId = targetTableId
      let createdTable: WorkspaceLeadTable | null = null

      // If user explicitly asked for a new table name, create it
      if (newTableName?.trim()) {
        const tableLabel = newTableName.trim()
        const { data: list } = await supabase
          .from('prospect_lists')
          .insert({
            user_id: userId,
            company_id: company.id,
            name: tableLabel,
            criteria: { personTitle, keywords, personCountry },
            status: 'completed',
            requested_count: count,
            found_count: sortedLeads.length,
            completed_at: new Date().toISOString(),
          })
          .select('id, name, created_at')
          .single()

        if (list) {
          listId = list.id
          createdTable = {
            id: list.id,
            name: list.name,
            leadCount: sortedLeads.length,
            createdAt: list.created_at,
          }
        }
      } else if (!listId) {
        // Reuse existing primary setup list
        const { data: existingPrimary } = await supabase
          .from('prospect_lists')
          .select('id')
          .eq('company_id', company.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        listId = existingPrimary?.id || null
      }

      const validLeads = sortedLeads.filter((item) => Boolean(item.lead))
      const companyRows = validLeads.map((item) => {
        const lead = item.lead!
        const domain = cleanDomain(lead.companyWebsite, lead.email)
        return {
          user_id: userId,
          company_id: company!.id,
          list_id: listId,
          name: lead.companyName || 'Unknown Account',
          domain: domain || null,
          website_url: lead.companyWebsite,
          industry: lead.companyIndustry,
          employee_range: lead.companySize,
          location: lead.location,
          country: personCountry[0] || 'United States',
          source: 'apify',
          source_ref: 'peakydev/leads-scraper-ppe',
          icp_fit_score: item.score,
          status: 'new',
          qualify_reason: item.reason,
          outreach_angle: item.outreachAngle,
          description: item.text.slice(0, 500),
        }
      })

      const { data: insertedCompanies } = await supabase
        .from('prospect_companies')
        .insert(companyRows)
        .select('id')

      const createdWorkspaceLeads: WorkspaceLead[] = []

      if (insertedCompanies && insertedCompanies.length > 0) {
        const contactRows = insertedCompanies.map((co, idx) => {
          const item = validLeads[idx]
          const lead = item.lead!
          return {
            prospect_company_id: co.id,
            full_name: lead.fullName,
            title: lead.jobTitle,
            email: lead.email,
            email_status: lead.email ? 'verified' : 'unverified',
            phone: lead.phone,
            linkedin_url: lead.linkedinUrl,
            country: lead.location,
            source: 'apify',
            contact_origin: 'leads_workspace',
            lead_status: 'new',
            qualify_reason: item.reason,
          }
        })

        const { data: insertedContacts } = await supabase.from('contacts').insert(contactRows).select('id')

        insertedCompanies.forEach((co, idx) => {
          const item = validLeads[idx]
          const lead = item.lead!
          const domain = cleanDomain(lead.companyWebsite, lead.email)
          createdWorkspaceLeads.push({
            id: co.id,
            contactId: insertedContacts?.[idx]?.id || null,
            tableId: listId,
            fullName: lead.fullName,
            title: lead.jobTitle || 'Decision Maker',
            companyName: lead.companyName || 'Company',
            companyDomain: domain,
            companyWebsite: lead.companyWebsite,
            email: lead.email,
            phone: lead.phone,
            linkedinUrl: lead.linkedinUrl,
            location: lead.location,
            industry: lead.companyIndustry,
            companySize: lead.companySize,
            whatTheyDo: item.text.slice(0, 300) || lead.companyIndustry || 'B2B Company',
            howWeCanHelp: item.outreachAngle || item.reason || 'High-fit ICP account.',
            score: item.score,
            status: 'new',
            enriched: false,
          })
        })
      }

      return Response.json({
        leads: createdWorkspaceLeads,
        table: createdTable,
      })
    }

    // ------------------------------------------------------------------------
    // 4. DEEP AI ENRICHMENT (Bulk or Single Lead)
    // ------------------------------------------------------------------------
    if (action === 'enrich_leads') {
      const inputLeads = Array.isArray(body.leads) ? (body.leads as WorkspaceLead[]) : []
      if (inputLeads.length === 0) {
        return Response.json({ error: 'No leads provided to enrich' }, { status: 400 })
      }

      const savedProfile = (blueprintRow?.profile as BusinessProfile | undefined) ?? null
      const ourSummary = savedProfile
        ? `${savedProfile.companyName} (${savedProfile.oneLiner}): ${savedProfile.valueProposition}. Key features: ${savedProfile.keyFeatures.join('; ')}`
        : `${company.name || 'Apsurn'}: B2B growth & outbound customer acquisition platform.`

      const ai = createVertexClient()
      const batch = inputLeads.slice(0, 20)

      const prompt = `You are a B2B GTM intelligence analyst.
OUR BUSINESS: ${ourSummary}

Enrich the following ${batch.length} B2B leads with deep, specific intelligence:
1. "whatTheyDo": Crisp 1-2 sentence explanation of what their company builds/sells, target market, and what ${batch[0]?.fullName || 'this leader'} oversees.
2. "howWeCanHelp": Specific, concrete 1-2 sentence outreach wedge explaining how OUR BUSINESS solves a high-priority problem for their role at their company.
3. "industry": Specific B2B industry vertical (2-4 words).
4. "score": Updated ICP fit score (integer 65 to 98).
5. "inferredEmail": If they already have an email, keep it; if missing and they have a companyDomain + first name, infer their likely work email (firstname@domain).

LEADS TO ENRICH:
${JSON.stringify(
  batch.map((l) => ({
    id: l.id,
    fullName: l.fullName,
    title: l.title,
    companyName: l.companyName,
    companyDomain: l.companyDomain,
    industry: l.industry,
    location: l.location,
    email: l.email,
    currentWhatTheyDo: l.whatTheyDo,
  })),
)}

Return strict JSON: { "enriched": [ { "id": string, "whatTheyDo": string, "howWeCanHelp": string, "industry": string, "score": number, "inferredEmail": string | null } ] }`

      const response = await ai.models.generateContent({
        model: getVertexModel(),
        contents: prompt,
        config: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
        },
      })

      const parsedJson = JSON.parse(response.text || '{"enriched":[]}') as {
        enriched?: Array<{
          id: string
          whatTheyDo: string
          howWeCanHelp: string
          industry: string
          score: number
          inferredEmail?: string | null
        }>
      }

      const enrichedList = parsedJson.enriched ?? []

      // Persist enriched fields back to Supabase in parallel
      await Promise.all(
        enrichedList.map(async (item) => {
          const original = batch.find((b) => b.id === item.id)
          await supabase
            .from('prospect_companies')
            .update({
              description: item.whatTheyDo,
              outreach_angle: item.howWeCanHelp,
              qualify_reason: item.howWeCanHelp,
              industry: item.industry || original?.industry,
              icp_fit_score: item.score,
              source_ref: 'ai_enriched',
            })
            .eq('id', item.id)
            .eq('company_id', company!.id)

          if (!original?.email && item.inferredEmail && original?.contactId) {
            await supabase
              .from('contacts')
              .update({ email: item.inferredEmail })
              .eq('id', original.contactId)
          }
        }),
      )

      return Response.json({ enriched: enrichedList })
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[api/leads POST]', err)
    return Response.json(
      { error: err instanceof Error ? err.message : 'Leads operation failed' },
      { status: 500 },
    )
  }
}

const patchSchema = z.object({
  action: z.enum(['move_to_table', 'update_tier', 'rename_table', 'update_lead']),
  leadIds: z.array(z.string()).optional(),
  tableId: z.string().nullable().optional(),
  tableName: z.string().optional(),
  score: z.number().optional(),
  whatTheyDo: z.string().optional(),
  howWeCanHelp: z.string().optional(),
})

export async function PATCH(req: Request) {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Invalid update payload' }, { status: 400 })

  try {
    const userId = await getCurrentUserId()
    const supabase = createAdminClient()
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (!company?.id) return Response.json({ ok: true })

    const { action, leadIds, tableId, tableName, score, whatTheyDo, howWeCanHelp } = parsed.data

    if (action === 'move_to_table' && leadIds?.length) {
      await supabase
        .from('prospect_companies')
        .update({ list_id: tableId })
        .in('id', leadIds)
        .eq('company_id', company.id)
    } else if (action === 'update_tier' && leadIds?.length && typeof score === 'number') {
      await supabase
        .from('prospect_companies')
        .update({ icp_fit_score: score })
        .in('id', leadIds)
        .eq('company_id', company.id)
    } else if (action === 'rename_table' && tableId && tableName?.trim()) {
      await supabase
        .from('prospect_lists')
        .update({ name: tableName.trim() })
        .eq('id', tableId)
        .eq('company_id', company.id)
    } else if (action === 'update_lead' && leadIds?.length === 1) {
      const updates: Record<string, unknown> = {}
      if (typeof score === 'number') updates.icp_fit_score = score
      if (whatTheyDo !== undefined) updates.description = whatTheyDo
      if (howWeCanHelp !== undefined) {
        updates.outreach_angle = howWeCanHelp
        updates.qualify_reason = howWeCanHelp
      }
      if (tableId !== undefined) updates.list_id = tableId
      await supabase
        .from('prospect_companies')
        .update(updates)
        .eq('id', leadIds[0])
        .eq('company_id', company.id)
    }

    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Update failed' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      leadIds?: string[]
      tableId?: string
    }
    const userId = await getCurrentUserId()
    const supabase = createAdminClient()
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle()

    if (!company?.id) return Response.json({ ok: true })

    if (Array.isArray(body.leadIds) && body.leadIds.length > 0) {
      await supabase
        .from('prospect_companies')
        .delete()
        .in('id', body.leadIds)
        .eq('company_id', company.id)
    }

    if (body.tableId) {
      await supabase
        .from('prospect_companies')
        .update({ list_id: null })
        .eq('list_id', body.tableId)
        .eq('company_id', company.id)
      await supabase
        .from('prospect_lists')
        .delete()
        .eq('id', body.tableId)
        .eq('company_id', company.id)
    }

    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Delete failed' }, { status: 500 })
  }
}
