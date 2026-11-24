export const MERGE_FIELD_KEYS = ['first_name', 'full_name', 'title', 'email', 'company', 'domain'] as const
export type MergeFieldKey = (typeof MERGE_FIELD_KEYS)[number]

export const MERGE_FIELD_LABELS: Record<MergeFieldKey, string> = {
  first_name: 'First name',
  full_name: 'Full name',
  title: 'Title',
  email: 'Email',
  company: 'Company',
  domain: 'Domain',
}

export type LeadMergeSource = {
  fullName?: string | null
  title?: string | null
  email?: string | null
  companyName?: string | null
  companyDomain?: string | null
}

export function firstNameOf(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] || ''
}

export function leadMergeVars(lead: LeadMergeSource | null | undefined): Record<MergeFieldKey, string> {
  return {
    first_name: firstNameOf(lead?.fullName),
    full_name: (lead?.fullName ?? '').trim(),
    title: (lead?.title ?? '').trim(),
    email: (lead?.email ?? '').trim(),
    company: (lead?.companyName ?? '').trim(),
    domain: (lead?.companyDomain ?? '').trim(),
  }
}

const KEY_ALIASES: Record<string, MergeFieldKey> = {
  first_name: 'first_name',
  firstname: 'first_name',
  full_name: 'full_name',
  fullname: 'full_name',
  name: 'full_name',
  title: 'title',
  jobtitle: 'title',
  job_title: 'title',
  role: 'title',
  email: 'email',
  company: 'company',
  companyname: 'company',
  company_name: 'company',
  domain: 'domain',
  companydomain: 'domain',
}

export function normalizeMergeKey(rawKey: string): MergeFieldKey | null {
  return KEY_ALIASES[rawKey.trim().toLowerCase()] ?? null
}

export function isMergeFieldKey(key: string): key is MergeFieldKey {
  return (MERGE_FIELD_KEYS as readonly string[]).includes(key)
}

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export function tokenizeLeadMentions(text: string, lead: LeadMergeSource | null | undefined): string {
  if (!text || !lead) return text
  // First normalize any {{firstName}} / {{companyName}} / {{jobTitle}} tokens
  let out = text.replace(TOKEN_RE, (full, rawKey: string) => {
    const mapped = normalizeMergeKey(rawKey)
    return mapped ? `{{${mapped}}}` : full
  })

  const vars = leadMergeVars(lead)
  const replacements: Array<[string, MergeFieldKey]> = [
    [vars.full_name, 'full_name'],
    [vars.email, 'email'],
    [vars.company, 'company'],
    [vars.domain, 'domain'],
    [vars.title, 'title'],
    [vars.first_name, 'first_name'],
  ]
  for (const [value, key] of replacements) {
    if (!value || value.length < 2) continue
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}_\\{])${escaped}(?![\\p{L}\\p{N}_\\}])`, 'giu'), `{{${key}}}`)
  }
  return out
}

export function resolveMergeFields(text: string, lead: LeadMergeSource | null | undefined): string {
  const vars = leadMergeVars(lead)
  return text.replace(TOKEN_RE, (full, rawKey: string) => {
    const key = normalizeMergeKey(rawKey)
    if (!key) return full
    return vars[key] || full
  })
}

export type MergeSegment =
  | { type: 'text'; value: string }
  | { type: 'field'; key: MergeFieldKey; raw: string }

export function parseMergeSegments(text: string): MergeSegment[] {
  const segments: MergeSegment[] = []
  let last = 0
  const re = new RegExp(TOKEN_RE.source, 'g')
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      segments.push({ type: 'text', value: text.slice(last, match.index) })
    }
    const mapped = normalizeMergeKey(match[1])
    if (mapped) {
      segments.push({ type: 'field', key: mapped, raw: `{{${mapped}}}` })
    } else {
      segments.push({ type: 'text', value: match[0] })
    }
    last = match.index + match[0].length
  }
  if (last < text.length) segments.push({ type: 'text', value: text.slice(last) })
  if (segments.length === 0) segments.push({ type: 'text', value: text })
  return segments
}
