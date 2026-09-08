import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/auth/session";

export default async function DashboardOverviewPage() {
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
        .select("*")
        .eq("company_id", company.id)
        .maybeSingle()
    : { data: null };

  const [
    { count: prospectCount },
    { count: sequenceCount },
    { count: inboxCount },
    analyticsSites,
  ] = company
    ? await Promise.all([
        supabase
          .from("prospect_companies")
          .select("id", { count: "exact", head: true })
          .eq("company_id", company.id),
        supabase
          .from("sequences")
          .select("id", { count: "exact", head: true })
          .eq("company_id", company.id),
        supabase
          .from("connected_inboxes")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
        supabase
          .from("analytics_sites")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId),
      ])
    : [{ count: 0 }, { count: 0 }, { count: 0 }, { count: 0 }];

  const siteCount =
    "error" in analyticsSites && analyticsSites.error ? 0 : (analyticsSites.count ?? 0);

  if (!company) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-neutral-900">Welcome to apsurn</h1>
        <p className="text-neutral-600">
          You haven&apos;t built a company blueprint yet.{" "}
          <Link href="/setup" className="font-medium text-neutral-900 underline">
            Enter your website URL
          </Link>{" "}
          to get started, or{" "}
          <Link href="/dashboard/analytics" className="font-medium text-neutral-900 underline">
            add a site to analytics
          </Link>
          .
        </p>
      </div>
    );
  }

  const icp = (blueprint?.icp as {
    industries?: string[];
    companySizeRange?: string;
    geographies?: string[];
  }) ?? {};
  const personas = (blueprint?.personas as Array<{ title: string }>) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-neutral-900">
          {company.name ?? "Your company"}
        </h1>
        <p className="text-neutral-600">{company.website_url}</p>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Prospects" value={prospectCount ?? 0} href="/dashboard/prospects" />
        <StatCard label="Sequences" value={sequenceCount ?? 0} href="/dashboard/sequences" />
        <StatCard label="Connected inboxes" value={inboxCount ?? 0} href="/dashboard/inboxes" />
        <StatCard label="Analytics" value={siteCount ?? 0} href="/dashboard/analytics" />
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Blueprint
        </h2>
        {!blueprint?.approved_at && (
          <p className="mb-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This blueprint hasn&apos;t been approved yet.{" "}
            <Link href="/setup" className="font-medium underline">
              Review and approve it
            </Link>{" "}
            before running prospecting.
          </p>
        )}
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="font-medium text-neutral-500">Industries</dt>
            <dd className="text-neutral-900">{(icp.industries ?? []).join(", ") || "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-500">Company size</dt>
            <dd className="text-neutral-900">{icp.companySizeRange || "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-500">Geographies</dt>
            <dd className="text-neutral-900">{(icp.geographies ?? []).join(", ") || "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-neutral-500">Personas</dt>
            <dd className="text-neutral-900">
              {personas.map((p) => p.title).join(", ") || "—"}
            </dd>
          </div>
        </dl>
        {blueprint?.value_prop && (
          <p className="mt-4 text-sm text-neutral-700">{blueprint.value_prop}</p>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ActionCard
          title="Find prospects"
          description="Discover companies and contacts matching your ICP."
          href="/dashboard/prospects"
        />
        <ActionCard
          title="Website analytics"
          description="Track page views, referrers, and live visitors on your sites."
          href="/dashboard/analytics"
        />
        <ActionCard
          title="Connect your inbox"
          description="Send outreach from your own Gmail or Outlook address."
          href="/dashboard/inboxes"
        />
        <ActionCard
          title="Build a sequence"
          description="Create a multi-step email sequence with scheduled follow-ups."
          href="/dashboard/sequences"
        />
      </section>
    </div>
  );
}

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300"
    >
      <div className="text-2xl font-semibold text-neutral-900">{value}</div>
      <div className="text-sm text-neutral-500">{label}</div>
    </Link>
  );
}

function ActionCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded-lg border border-neutral-200 bg-white p-5 transition-colors hover:border-neutral-300"
    >
      <div className="font-medium text-neutral-900">{title}</div>
      <div className="text-sm text-neutral-500">{description}</div>
    </Link>
  );
}

export const dynamic = "force-dynamic";
