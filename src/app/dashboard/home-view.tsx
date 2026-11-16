import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserIdOrRedirect } from "@/lib/auth/session";
import { CompanyFavicon } from "@/components/prospects/CompanyFavicon";
import { PricingCardShell } from "@/components/ui/pricing-card-shell";
import { GreetingHeader } from "@/components/dashboard/home/GreetingHeader";
import { DashboardHomeShell } from "@/components/dashboard/home/DashboardHomeShell";
import { RadarFeed } from "@/components/radar/RadarFeed";
import { loadRadarFeed } from "@/lib/market/feed";
import type { CompanyIcp, CompanyPersona } from "@/lib/blueprint/types";

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function daysAgo(iso: string | null | undefined) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export async function DashboardHomePage() {
  const db = createAdminClient();
  const userId = await getCurrentUserIdOrRedirect("/dashboard");

  const { data: company } = await db
    .from("companies")
    .select("id,name,website_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (!company) {
    return (
      <div className="w-full">
        <GreetingHeader />
        <div className="mt-6 rounded-xl border border-dashed border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
          <p className="font-medium text-neutral-900 dark:text-neutral-100">Finish setting up your workspace</p>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Build your company blueprint so Radar knows who to listen for.</p>
          <Link
            href="/setup"
            className="mt-4 inline-flex items-center rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          >
            Go to Setup
          </Link>
        </div>
      </div>
    );
  }

  const [{ data: blueprint }, { data: runs }] = await Promise.all([
    db
      .from("company_blueprints")
      .select("icp,personas,value_prop,positioning,product_summary,competitors,edited_by_user,approved_at,generated_at")
      .eq("company_id", company.id)
      .maybeSingle(),
    db
      .from("prospecting_runs")
      .select("id,status,stage,processed_count,target_count,contact_count,prospect_lists(name)")
      .eq("user_id", userId)
      .in("status", ["queued", "discovering", "enriching", "verifying"])
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const run = runs?.[0];
  const runList = one(run?.prospect_lists as { name?: string } | { name?: string }[] | null);
  const runPct = run && run.target_count > 0 ? Math.min(100, Math.round((run.processed_count / run.target_count) * 100)) : 0;

  const icp = (blueprint?.icp ?? {}) as Partial<CompanyIcp>;
  const personas = (Array.isArray(blueprint?.personas) ? blueprint.personas : []) as CompanyPersona[];
  const competitors = (Array.isArray(blueprint?.competitors) ? blueprint.competitors : []) as string[];

  const domain = (company.website_url ?? "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
  const panel = "rounded-xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-[#121212]";
  const feed = await loadRadarFeed(db, userId, company.id);

  const aside = (
    <>
      <PricingCardShell className="h-auto p-2" innerClassName="gap-2 p-3 sm:p-3">
        <div className="flex items-start gap-2.5">
          <CompanyFavicon domain={domain} name={company.name ?? undefined} className="mt-0.5 size-10 rounded-lg" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Company blueprint</p>
            <h3 className="mt-0.5 font-heading text-[26px] leading-tight tracking-[-0.02em] text-neutral-900 dark:text-neutral-100" style={{ fontWeight: 700 }}>
              {company.name ?? "Your company"}
            </h3>
            {domain ? <p className="text-[12px] text-neutral-400">{domain}</p> : null}
          </div>
          {blueprint ? (
            <span
              className={
                blueprint.approved_at
                  ? "shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                  : "shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              }
            >
              {blueprint.approved_at ? "Active" : "Draft"}
            </span>
          ) : null}
        </div>

        {!blueprint ? (
          <p className="text-[13px] leading-snug text-neutral-500 dark:text-neutral-400">No blueprint yet. Build one so Radar knows who to listen for.</p>
        ) : (
          <>
            {blueprint.product_summary ? (
              <p className="text-[13px] leading-snug tracking-[-0.03em] text-neutral-600 dark:text-neutral-400">{blueprint.product_summary}</p>
            ) : null}
            {blueprint.value_prop && blueprint.value_prop !== blueprint.product_summary ? (
              <p className="text-[13px] leading-snug text-neutral-600 dark:text-neutral-400">{blueprint.value_prop}</p>
            ) : null}
            <p className="text-[12px] text-neutral-600 dark:text-neutral-400">
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Ideal customer: </span>
              {[icp.industries?.slice(0, 3).join(", "), icp.companySizeRange, icp.geographies?.slice(0, 2).join(", ")]
                .filter(Boolean)
                .join(" · ") || "Not set"}
            </p>
            {personas.length > 0 ? (
              <p className="text-[12px] text-neutral-600 dark:text-neutral-400">
                <span className="font-medium text-neutral-700 dark:text-neutral-300">Personas: </span>
                {personas.slice(0, 5).map((p) => p.title).join(" · ")}
              </p>
            ) : null}
            {competitors.length > 0 ? (
              <p className="text-[12px] text-neutral-600 dark:text-neutral-400">
                <span className="font-medium text-neutral-700 dark:text-neutral-300">Competitors: </span>
                {competitors.slice(0, 4).join(", ")}
              </p>
            ) : null}
          </>
        )}
        <div className="flex items-center justify-between pt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
          <span>
            {blueprint ? `${blueprint.edited_by_user ? "Edited" : "Generated"} ${daysAgo(blueprint.generated_at) ?? ""}` : ""}
          </span>
          <Link href="/setup" className="font-semibold text-neutral-900 hover:underline dark:text-neutral-100">
            {blueprint ? "Review" : "Build it"}
          </Link>
        </div>
      </PricingCardShell>

      <section className={`${panel} p-4`}>
        <h2 className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">Scan</h2>
        <p className="mt-2 text-[12px] text-neutral-500 dark:text-neutral-400">
          {feed.lastScannedAt ? `Last checked ${daysAgo(feed.lastScannedAt)}` : "Not checked yet"}
          {" · "}
          {feed.mentions.length} new
        </p>
        <p className="mt-1 text-[12px] text-neutral-500 dark:text-neutral-400">
          {feed.keywords.filter((keyword) => keyword.isActive).length} phrases listening
          {feed.dismissedCount > 0 ? ` · ${feed.dismissedCount} dismissed` : ""}
        </p>
      </section>

      {run ? (
        <section className={`${panel} p-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">Active run</h2>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium capitalize text-neutral-700 dark:text-neutral-300">
              <span className="size-1.5 animate-pulse rounded-full bg-neutral-900 dark:bg-neutral-100" aria-hidden />
              {run.status}
            </span>
          </div>
          {runList?.name ? <p className="mt-2 truncate text-[12px] text-neutral-500 dark:text-neutral-400">{runList.name}</p> : null}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div className="h-full rounded-full bg-neutral-900 dark:bg-neutral-100" style={{ width: `${runPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
            <span>
              {run.processed_count} / {run.target_count}
            </span>
            <span>{run.contact_count} contacts</span>
          </div>
        </section>
      ) : null}
    </>
  );

  return (
    <DashboardHomeShell aside={aside}>
      <RadarFeed initial={feed} />
    </DashboardHomeShell>
  );
}
