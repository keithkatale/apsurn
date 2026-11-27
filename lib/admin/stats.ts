import { requireAdmin } from '@/lib/admin/access'
import { PLANS, type PlanKey } from '@/lib/billing/plans'
import { createAdminClient } from '@/lib/supabase/admin'

// Every function re-checks the admin gate, so a data call can never run for anyone else even if a page forgets to.

export const RANGES = [7, 30, 90] as const
export function parseRange(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value)
  return (RANGES as readonly number[]).includes(n) ? n : 30
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await createAdminClient().rpc(name, args)
  if (error) throw new Error(`${name}: ${error.message}`)
  return (data ?? []) as T[]
}

/** Row count of a table, or null when the table does not exist yet. */
async function count(table: string, eq?: [string, string]) {
  let query = createAdminClient().from(table).select('*', { count: 'exact', head: true })
  if (eq) query = query.eq(eq[0], eq[1])
  const { count: n, error } = await query
  return error ? null : n ?? 0
}

export type UserCounts = {
  total: number
  guests: number
  registered: number
  new_7d: number
  new_30d: number
  active_1d: number
  active_7d: number
  active_30d: number
}

export type DayPoint = {
  day: string
  visitors: number
  pageviews: number
  signups: number
  logins: number
  analyses: number
  emails_sent: number
  scans: number
  new_users: number
}

export type FunnelStep = { step: string; ord: number; actors: number }

const num = (v: unknown) => Number(v ?? 0)

export async function getUserCounts(): Promise<UserCounts> {
  await requireAdmin()
  const [row] = await rpc<Record<string, unknown>>('admin_user_counts')
  return {
    total: num(row?.total),
    guests: num(row?.guests),
    registered: num(row?.registered),
    new_7d: num(row?.new_7d),
    new_30d: num(row?.new_30d),
    active_1d: num(row?.active_1d),
    active_7d: num(row?.active_7d),
    active_30d: num(row?.active_30d),
  }
}

export async function getDailySeries(days: number): Promise<DayPoint[]> {
  await requireAdmin()
  const rows = await rpc<Record<string, unknown>>('admin_daily_series', { p_days: days })
  return rows.map((r) => ({
    day: String(r.day),
    visitors: num(r.visitors),
    pageviews: num(r.pageviews),
    signups: num(r.signups),
    logins: num(r.logins),
    analyses: num(r.analyses),
    emails_sent: num(r.emails_sent),
    scans: num(r.scans),
    new_users: num(r.new_users),
  }))
}

export async function getFunnel(days: number): Promise<FunnelStep[]> {
  await requireAdmin()
  const rows = await rpc<Record<string, unknown>>('admin_funnel', { p_days: days })
  return rows.map((r) => ({ step: String(r.step), ord: num(r.ord), actors: num(r.actors) }))
}

export type TopRow = { value: string; hits: number; visitors: number }
export async function getTop(days: number, column: 'path' | 'referrer' | 'device', limit = 10): Promise<TopRow[]> {
  await requireAdmin()
  const rows = await rpc<Record<string, unknown>>('admin_top_values', { p_days: days, p_column: column, p_limit: limit })
  return rows.map((r) => ({ value: String(r.value), hits: num(r.hits), visitors: num(r.visitors) }))
}

export type BillingSummary = {
  subscribers: number
  byPlan: { plan: string; count: number; mrr: number }[]
  pastDue: number
  cancelling: number
  mrr: number
  unlocks: number
  creditsOutstanding: number
  accounts: number
}

const ACTIVE = new Set(['active', 'past_due'])

export async function getBillingSummary(): Promise<BillingSummary> {
  await requireAdmin()
  const admin = createAdminClient()
  const { data } = await admin
    .from('billing_accounts')
    .select('plan_key, subscription_status, cancel_at_period_end, plan_credits, topup_credits')
  const rows = data ?? []
  const byPlan = new Map<string, { count: number; mrr: number }>()
  let pastDue = 0
  let cancelling = 0
  let subscribers = 0
  let credits = 0
  for (const r of rows) {
    credits += num(r.plan_credits) + num(r.topup_credits)
    if (!r.plan_key || !ACTIVE.has(String(r.subscription_status))) continue
    subscribers += 1
    if (r.subscription_status === 'past_due') pastDue += 1
    if (r.cancel_at_period_end) cancelling += 1
    const price = PLANS[r.plan_key as PlanKey]?.priceUsd ?? 0
    const entry = byPlan.get(String(r.plan_key)) ?? { count: 0, mrr: 0 }
    entry.count += 1
    entry.mrr += price
    byPlan.set(String(r.plan_key), entry)
  }
  const { count: unlocks } = await admin
    .from('billing_credit_ledger')
    .select('*', { count: 'exact', head: true })
    .eq('reason', 'unlock')
  const plans = [...byPlan.entries()].map(([plan, v]) => ({ plan, ...v }))
  return {
    subscribers,
    byPlan: plans,
    pastDue,
    cancelling,
    mrr: plans.reduce((sum, p) => sum + p.mrr, 0),
    unlocks: unlocks ?? 0,
    creditsOutstanding: credits,
    accounts: rows.length,
  }
}

export type ProductCounts = {
  workspaces: number | null
  leads: number | null
  campaigns: number | null
  emailsSent: number | null
  inboxes: number | null
  signals: number | null
  scans: number | null
  scansFailed: number | null
}

export async function getProductCounts(): Promise<ProductCounts> {
  await requireAdmin()
  const [workspaces, leads, campaigns, emailsSent, inboxes, signals, scans, scansFailed] = await Promise.all([
    count('companies'),
    count('prospect_companies'),
    count('sequences'),
    count('campaign_sends'),
    count('connected_inboxes'),
    count('signals'),
    count('scan_runs'),
    count('scan_runs', ['status', 'failed']),
  ])
  return { workspaces, leads, campaigns, emailsSent, inboxes, signals, scans, scansFailed }
}

export type UserRow = {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  is_guest: boolean
  plan_key: string | null
  subscription_status: string | null
  credits: number
  leads: number
  sends: number
  signals: number
}

export async function getUsersPage(search: string, page: number, pageSize = 25) {
  await requireAdmin()
  const rows = await rpc<Record<string, unknown>>('admin_users_page', {
    p_search: search.trim().slice(0, 100),
    p_limit: pageSize,
    p_offset: Math.max(0, page - 1) * pageSize,
  })
  const users: UserRow[] = rows.map((r) => ({
    id: String(r.id),
    email: String(r.email ?? ''),
    created_at: String(r.created_at),
    last_sign_in_at: r.last_sign_in_at ? String(r.last_sign_in_at) : null,
    is_guest: Boolean(r.is_guest),
    plan_key: r.plan_key ? String(r.plan_key) : null,
    subscription_status: r.subscription_status ? String(r.subscription_status) : null,
    credits: num(r.credits),
    leads: num(r.leads),
    sends: num(r.sends),
    signals: num(r.signals),
  }))
  return { users, total: num(rows[0]?.total) }
}

export type SubscriberRow = {
  user_id: string
  email: string
  plan_key: string | null
  subscription_status: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  credits: number
  created_at: string
}

export async function getSubscribers(): Promise<SubscriberRow[]> {
  await requireAdmin()
  const rows = await rpc<Record<string, unknown>>('admin_subscribers')
  return rows.map((r) => ({
    user_id: String(r.user_id),
    email: String(r.email ?? ''),
    plan_key: r.plan_key ? String(r.plan_key) : null,
    subscription_status: r.subscription_status ? String(r.subscription_status) : null,
    current_period_end: r.current_period_end ? String(r.current_period_end) : null,
    cancel_at_period_end: Boolean(r.cancel_at_period_end),
    credits: num(r.credits),
    created_at: String(r.created_at),
  }))
}

export type EventRow = {
  id: number
  created_at: string
  name: string
  email: string | null
  path: string | null
  props: Record<string, unknown>
}

export async function getRecentEvents(name: string, limit = 100): Promise<EventRow[]> {
  await requireAdmin()
  const rows = await rpc<Record<string, unknown>>('admin_recent_events', { p_limit: limit, p_name: name })
  return rows.map((r) => ({
    id: num(r.id),
    created_at: String(r.created_at),
    name: String(r.name),
    email: r.email ? String(r.email) : null,
    path: r.path ? String(r.path) : null,
    props: (r.props as Record<string, unknown>) ?? {},
  }))
}

export type CreditUsageRow = { reason: string; events: number; credits: number }
export async function getCreditUsage(days: number): Promise<CreditUsageRow[]> {
  await requireAdmin()
  const rows = await rpc<Record<string, unknown>>('admin_credit_usage', { p_days: days })
  return rows.map((r) => ({ reason: String(r.reason), events: num(r.events), credits: num(r.credits) }))
}

export type SignalSourceRow = { source: string; signals: number; avg_score: number; leads: number }
export async function getSignalSources(days: number): Promise<SignalSourceRow[]> {
  await requireAdmin()
  try {
    const rows = await rpc<Record<string, unknown>>('admin_signal_sources', { p_days: days })
    return rows.map((r) => ({
      source: String(r.source),
      signals: num(r.signals),
      avg_score: num(r.avg_score),
      leads: num(r.leads),
    }))
  } catch {
    return []
  }
}
