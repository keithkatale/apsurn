import Link from "next/link";
import { AdminShell, requireAdminPage } from "@/components/admin/AdminShell";
import { profileOf, type EventRow } from "@/lib/admin/analytics-core";
import { loadEvents, loadUsers } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ago(days: number | null) {
  if (days === null) return "—";
  if (days === 0) return "today";
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const admin = await requireAdminPage();
  const { q = "", page = "1" } = await searchParams;
  const needle = q.trim().toLowerCase();
  const pageNumber = Math.max(1, Number(page) || 1);

  const now = new Date();
  const since = new Date(now.getTime() - 120 * 86_400_000).toISOString();
  const [{ users }, { rows, error }] = await Promise.all([loadUsers(), loadEvents(since)]);

  const byUser = new Map<string, EventRow[]>();
  for (const row of rows) {
    if (!row.user_id) continue;
    const list = byUser.get(row.user_id) ?? [];
    list.push(row);
    byUser.set(row.user_id, list);
  }

  const filtered = users.filter((u) => !needle || u.email.toLowerCase().includes(needle) || (u.name ?? "").toLowerCase().includes(needle));
  const pageUsers = filtered.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return (
    <AdminShell active="/admin/users" email={admin.email} title="Users" subtitle={`${users.length} people with an account. Open one to see what they use and how often they return.`}>
      <form className="mb-4 flex gap-2" action="/admin/users">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or email"
          className="h-10 w-full max-w-sm rounded-lg border border-neutral-200 bg-white px-3 text-sm outline-none focus:border-[#4379EE]"
        />
        <button type="submit" className="h-10 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white">
          Search
        </button>
      </form>
      {error ? <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Usage data is not available yet ({error}). Apply migration 0037_admin_ops.sql.</p> : null}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Last seen</th>
              <th className="px-4 py-3 text-right">Sessions</th>
              <th className="px-4 py-3 text-right">Days active</th>
              <th className="px-4 py-3">Comes back</th>
              <th className="px-4 py-3">Uses most</th>
            </tr>
          </thead>
          <tbody>
            {pageUsers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  No users match.
                </td>
              </tr>
            ) : null}
            {pageUsers.map((user) => {
              const p = profileOf(byUser.get(user.id) ?? [], now.toISOString());
              return (
                <tr key={user.id} className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${user.id}`} className="font-medium text-neutral-900 hover:underline">
                      {user.name ?? user.email}
                    </Link>
                    {user.name ? <p className="text-[12px] text-neutral-500">{user.email}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{when(user.createdAt)}</td>
                  <td className="px-4 py-3 text-neutral-600">{p.lastSeen ? ago(p.daysSinceLastSeen) : when(user.lastSignInAt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.sessions}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.activeDays}</td>
                  <td className="px-4 py-3 text-neutral-600">
                    {p.avgDaysBetweenVisits === null ? (p.activeDays === 1 ? "Visited once" : "—") : `every ${p.avgDaysBetweenVisits} days`}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{p.sections[0]?.label ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-neutral-600">
          <span>
            Page {pageNumber} of {pages}
          </span>
          <div className="flex gap-2">
            {pageNumber > 1 ? (
              <Link className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-neutral-200 hover:bg-neutral-100" href={`/admin/users?q=${encodeURIComponent(q)}&page=${pageNumber - 1}`}>
                Previous
              </Link>
            ) : null}
            {pageNumber < pages ? (
              <Link className="rounded-lg bg-white px-3 py-1.5 ring-1 ring-neutral-200 hover:bg-neutral-100" href={`/admin/users?q=${encodeURIComponent(q)}&page=${pageNumber + 1}`}>
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
