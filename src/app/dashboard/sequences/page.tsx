import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/auth/session";
import { CreateSequenceModal } from "@/components/sequences/CreateSequenceModal";

interface EnrolledContact {
  id: string;
  status: string;
  current_step: number;
  contacts: { id: string; full_name: string | null; email: string | null } | null;
}

export default async function SequencesPage() {
  const supabase = createAdminClient();
  const userId = await getCurrentUserId();

  const { data: sequences } = await supabase
    .from("sequences")
    .select("*, sequence_steps(*), enrollments(id, status, current_step, contacts(id, full_name, email))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Sequences</h1>
          <p className="text-neutral-600">
            Multi-step email outreach with scheduled follow-ups.
          </p>
        </div>
        <CreateSequenceModal />
      </header>

      {!sequences || sequences.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="font-medium text-neutral-900">No sequences yet</p>
          <p className="mt-1 text-sm text-neutral-500">
            Create a sequence, then enroll contacts from the Prospects page. Sending is not wired
            up yet (Gmail isn&apos;t connected), but enrollments and step order are tracked here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sequences.map((s) => {
            const enrollments: EnrolledContact[] = s.enrollments ?? [];
            const activeCount = enrollments.filter((e) => e.status === "active").length;
            return (
              <div key={s.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-neutral-900">{s.name}</span>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                    {s.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-500">
                  {(s.sequence_steps ?? []).length} steps · {activeCount} active enrollments
                </p>
                {enrollments.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-0.5 border-t border-neutral-100 pt-2 text-sm">
                    {enrollments.map((e) => (
                      <li key={e.id} className="text-neutral-600">
                        {e.contacts?.full_name ?? "Unknown contact"}
                        {e.contacts?.email ? ` (${e.contacts.email})` : ""}
                        <span className="ml-1 text-xs text-neutral-400">
                          · {e.status} · step {e.current_step}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const dynamic = "force-dynamic";
