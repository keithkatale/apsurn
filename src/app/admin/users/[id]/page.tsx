import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell, BarList, StatCard, requireAdminPage } from "@/components/admin/AdminShell";
import { EmailComposer } from "@/components/admin/EmailComposer";
import { profileOf } from "@/lib/admin/analytics-core";
import { firstNameForEmail, loadEvents, loadUsers, visitorIdsForUsers } from "@/lib/admin/data";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function workspaceFacts(userId: string) {
  const db = createAdminClient();
  const [{ data: company }, leads, campaigns, inboxes, optOut] = await Promise.all([
    db.from("companies").select("name, website_url").eq("user_id", userId).maybeSingle(),
    db.from("prospect_companies").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("sequences").select("id", { count: "exact", head: true }).eq("user_id", userId),
    db.from("connected_inboxes").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "connected"),
    db.from("email_preferences").select("marketing_opt_out").eq("user_id", userId).maybeSingle(),
  ]);
  return {
    company: (company?.name as string | undefined) ?? null,
    website: (company?.website_url as string | undefined) ?? null,
    leads: leads.count ?? 0,
    campaigns: campaigns.count ?? 0,
    inboxes: inboxes.count ?? 0,
    optedOut: Boolean(optOut.data?.marketing_opt_out),
  };
}

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage();
  const { id } = await params;
  const { users } = await loadUsers();
  const user = users.find((u) => u.id === id);
  if (!user) notFound();

  const now = new Date();
  const since = new Date(now.getTime() - 180 * 86_400_000).toISOString();
  // Visits from before they signed up (same browser) are theirs too.
  const visitorIds = await visitorIdsForUsers([id]);
  const [{ rows, error }, facts] = await Promise.all([loadEvents(since, { userIds: [id], visitorIds }), workspaceFacts(id)]);
  const profile = profileOf(rows, now.toISOString());

  return (
    <AdminShell active="/admin/users" email={admin.email} title={user.name ?? user.email} subtitle={user.name ? user.email : undefined}>
      <Link href="/admin/users" className="mb-4 inline-block text-sm text-[#4379EE] hover:underline">
        ← All users
      </Link>
      {error ? <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">Usage data is not available yet ({error}). Apply migration 0037_admin_ops.sql.</p> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Joined" value={when(user.createdAt).split(",")[0]} />
        <StatCard label="Last seen" value={profile.daysSinceLastSeen === null ? "—" : profile.daysSinceLastSeen === 0 ? "Today" : `${profile.daysSinceLastSeen}d ago`} hint={profile.lastSeen ? when(profile.lastSeen) : undefined} />
        <StatCard label="Sessions" value={profile.sessions} hint={`${profile.pageviews} page views`} />
        <StatCard
          label="Comes back"
          value={profile.avgDaysBetweenVisits === null ? (profile.activeDays <= 1 ? "Once" : "—") : `every ${profile.avgDaysBetweenVisits}d`}
          hint={`${profile.activeDays} active days`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <BarList title="What they use most" rows={profile.sections} />
        <section className="rounded-xl border border-neutral-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-neutral-900">Workspace</h2>
          <dl className="mt-3 space-y-2 text-[13px]">
            {[
              ["Company", facts.company ?? "—"],
              ["Website", facts.website ?? "—"],
              ["Leads found", String(facts.leads)],
              ["Campaigns", String(facts.campaigns)],
              ["Inboxes connected", String(facts.inboxes)],
              ["Product emails", facts.optedOut ? "Unsubscribed" : "Subscribed"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-neutral-500">{k}</dt>
                <dd className="min-w-0 truncate text-right text-neutral-900">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="rounded-xl border border-neutral-200 bg-white p-4 lg:col-span-1">
          <h2 className="text-sm font-semibold text-neutral-900">Recent visits</h2>
          {profile.recentSessions.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-400">No visits recorded yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {profile.recentSessions.map((s) => (
                <li key={s.sessionId} className="text-[13px]">
                  <p className="font-medium text-neutral-900">{when(s.startedAt)}</p>
                  <p className="text-neutral-500">
                    {s.pages} pages · {s.minutes} min · from {s.source}
                  </p>
                  <p className="text-neutral-400">{s.sections.slice(0, 4).join(", ")}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Email {firstNameForEmail(user)}</h2>
        <p className="mb-3 text-[13px] text-neutral-500">A personal note, for example to help them finish setup or boost conversion. Replies go to keith@apsurn.com.</p>
        <EmailComposer mode="individual" userId={user.id} recipientLabel={user.email} />
      </section>
    </AdminShell>
  );
}
