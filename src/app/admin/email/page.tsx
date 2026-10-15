import { AdminShell, requireAdminPage } from "@/components/admin/AdminShell";
import { EmailComposer } from "@/components/admin/EmailComposer";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminEmailPage() {
  const admin = await requireAdminPage();
  const { data: history } = await createAdminClient()
    .from("admin_emails")
    .select("id, kind, subject, recipient_count, sent_count, failed_count, created_at, created_by")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <AdminShell
      active="/admin/email"
      email={admin.email}
      title="Email"
      subtitle="Send a designed email to everyone with an account. To write to one person, open them from Users."
    >
      <EmailComposer mode="broadcast" />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">Sent</h2>
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[11px] font-medium uppercase tracking-wide text-neutral-400">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3 text-right">Sent</th>
                <th className="px-4 py-3 text-right">Failed</th>
              </tr>
            </thead>
            <tbody>
              {(history ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    Nothing sent yet.
                  </td>
                </tr>
              ) : null}
              {(history ?? []).map((row) => (
                <tr key={row.id as string} className="border-b border-neutral-100 last:border-b-0">
                  <td className="px-4 py-3 text-neutral-600">{new Date(row.created_at as string).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                  <td className="px-4 py-3 capitalize text-neutral-600">{row.kind as string}</td>
                  <td className="px-4 py-3 text-neutral-900">{row.subject as string}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.sent_count as number}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.failed_count as number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
