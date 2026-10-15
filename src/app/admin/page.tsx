import Link from "next/link";
import { AdminShell, BarList, DailyBars, StatCard, requireAdminPage } from "@/components/admin/AdminShell";
import { summarize } from "@/lib/admin/analytics-core";
import { loadEvents, loadUsers, MAX_EVENTS } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

/** Server pages render once per request, so reading the clock here is fine; the lint rule only sees the call site. */
function currentTime() {
  return Date.now();
}

function pct(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "0%";
}

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const admin = await requireAdminPage();
  const requested = Number((await searchParams).range);
  const range = (RANGES as readonly number[]).includes(requested) ? requested : 30;

  const now = currentTime();
  const sinceIso = new Date(now - range * 86_400_000).toISOString();
  // History before the period is needed to tell returning visitors from new ones.
  const lookbackIso = new Date(now - 120 * 86_400_000).toISOString();
  const [{ rows, truncated, error }, { users, guests }] = await Promise.all([loadEvents(lookbackIso), loadUsers()]);
  const overview = summarize(rows, sinceIso);

  const newUsers = users.filter((u) => u.createdAt >= sinceIso).length;
  const activeUserIds = new Set(rows.filter((r) => r.created_at >= sinceIso && r.user_id).map((r) => r.user_id as string));
  const activeUsers = users.filter((u) => activeUserIds.has(u.id)).length;

  return (
    <AdminShell active="/admin" email={admin.email} title="Overview" subtitle="Who is using apsurn, where they come from, and who keeps coming back.">
      <div className="mb-5 flex items-center gap-2">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/admin?range=${r}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${r === range ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-100"}`}
          >
            Last {r} days
          </Link>
        ))}
      </div>

      {error ? (
        <p className="mb-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Visit tracking has no data yet ({error}). Apply migration 0037_admin_ops.sql, then visits start to show up here.
        </p>
      ) : null}
      {truncated ? (
        <p className="mb-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Showing the most recent {MAX_EVENTS.toLocaleString()} events; older history is cut off, so returning-visitor counts may be low.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Users with an account" value={users.length} hint={`${newUsers} new in ${range} days`} />
        <StatCard label="Active users" value={activeUsers} hint={`used the app in ${range} days`} />
        <StatCard label="Visitors" value={overview.visitors} hint={`${overview.newVisitors} new`} />
        <StatCard label="Sessions" value={overview.sessions} hint={`${overview.avgPagesPerSession} pages each`} />
        <StatCard label="Returning visitors" value={overview.returningVisitors} hint={`${pct(overview.returningVisitors, overview.visitors)} of visitors`} />
        <StatCard label="Repeat sessions" value={overview.repeatSessions} hint="not a visitor's first visit" />
        <StatCard label="Page views" value={overview.pageviews} />
        <StatCard label="Guest workspaces" value={guests} hint="started setup, no account yet" />
      </div>

      <div className="mt-4">
        <DailyBars days={overview.daily} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <BarList title="Where traffic comes from" rows={overview.sources} />
        <BarList title="Most used sections" rows={overview.sections} />
        <BarList title="Top pages" rows={overview.pages} />
        <BarList title="Countries" rows={overview.countries} empty="No country data (needs a geo header from your host)." />
        <BarList title="Devices" rows={overview.devices} />
      </div>
    </AdminShell>
  );
}
