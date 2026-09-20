import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/auth/session";
import { RebuildBlueprintButton } from "@/components/settings/RebuildBlueprintButton";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // Pinned locale/zone: a bare toLocaleDateString renders differently on the
  // server and in the browser, which React reports as a hydration mismatch.
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function SettingsPage() {
  const supabase = createAdminClient();
  const userId = await getCurrentUserId();

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: blueprint } = company
    ? await supabase
        .from("company_blueprints")
        .select("generated_at,approved_at")
        .eq("company_id", company.id)
        .maybeSingle()
    : { data: null };


  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-neutral-900">Settings</h1>
        <p className="text-neutral-600">Your company profile and account.</p>
      </header>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Company blueprint</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Everything the AI targets — your ICP, personas and positioning — is derived from your website.
            </p>
          </div>
          <div className="shrink-0">
            <RebuildBlueprintButton websiteUrl={company?.website_url} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="font-medium text-neutral-500">Website</dt>
            <dd className="truncate text-neutral-900">{company?.website_url ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-500">Status</dt>
            <dd className="text-neutral-900">{company?.status ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-500">Last built</dt>
            <dd className="text-neutral-900">{formatDate(blueprint?.generated_at)}</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-500">Approved</dt>
            <dd className={blueprint?.approved_at ? "text-neutral-900" : "text-amber-700"}>
              {blueprint?.approved_at ? formatDate(blueprint.approved_at) : "Not approved"}
            </dd>
          </div>
        </dl>

        <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          Rebuilding analyses your site again and replaces the current blueprint. You&apos;ll review and approve the new
          one before it&apos;s used, and prospecting stays paused until you do. Change the address on the next screen to
          point at a different site.
        </p>
      </section>

      <p className="text-sm text-neutral-500">
        Account/auth settings will live here once user authentication is added.
      </p>
    </div>
  );
}

export const dynamic = "force-dynamic";
