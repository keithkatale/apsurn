import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/auth/session";

export default async function SettingsPage() {
  const supabase = createAdminClient();
  const userId = await getCurrentUserId();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-neutral-900">Settings</h1>
        <p className="text-neutral-600">Your company profile and account.</p>
      </header>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Company
        </h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="font-medium text-neutral-500">Website</dt>
            <dd className="text-neutral-900">{company?.website_url ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-500">Status</dt>
            <dd className="text-neutral-900">{company?.status ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <p className="text-sm text-neutral-500">
        Account/auth settings will live here once user authentication is added.
      </p>
    </div>
  );
}

export const dynamic = "force-dynamic";
