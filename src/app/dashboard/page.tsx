import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/auth/session";
import { CampaignIcon } from "@/components/campaigns/CampaignIcon";
import { CompanyFavicon } from "@/components/prospects/CompanyFavicon";
import { PricingCardShell } from "@/components/ui/pricing-card-shell";
import { GreetingHeader } from "@/components/dashboard/home/GreetingHeader";
import { DashboardHomeShell, type DashboardStarter } from "@/components/dashboard/home/DashboardHomeShell";
import type { CompanyIcp, CompanyPersona } from "@/lib/blueprint/types";

export const dynamic = "force-dynamic";

const REPLY_LIMIT = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function daysAgo(iso: string | null | undefined) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function weekAgoIso() {
  return new Date(Date.now() - WEEK_MS).toISOString();
}

function pct(part: number, whole: number) {
  if (whole === 0) return "—";
  const value = (part / whole) * 100;
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}%`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{children}</h2>;
}

export default async function DashboardHomePage() {
  const db = createAdminClient();
  const userId = await getCurrentUserId();

  const { data: company } = await db
    .from("companies")
    .select("id,name,website_url")
    .eq("user_id", userId)
    .maybeSingle();

  if (!company) {
    return (
      <div className="w-full">
        <GreetingHeader replies={0} campaigns={0} />
        <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="font-medium text-neutral-900">Finish setting up your workspace</p>
          <p className="mt-1 text-sm text-neutral-500">Build your company blueprint so agents know who to look for.</p>
          <Link
            href="/setup"
            className="mt-4 inline-flex items-center rounded-full bg-[#4379EE] px-4 py-2 text-sm font-medium text-white hover:bg-[#3567D6]"
          >
            Go to Setup
          </Link>
        </div>
      </div>
    );
  }

  const weekAgo = weekAgoIso();

  const [{ data: blueprint }, { data: sequences }, { data: runs }] = await Promise.all([
    db
      .from("company_blueprints")
      .select("icp,personas,value_prop,positioning,product_summary,competitors,edited_by_user,approved_at,generated_at")
      .eq("company_id", company.id)
      .maybeSingle(),
    db
      .from("sequences")
      .select("id,name,status,description,pain,icon_svg,estimated_volume,created_at,sequence_steps(id)")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
    db
      .from("prospecting_runs")
      .select("id,status,stage,processed_count,target_count,contact_count,prospect_lists(name)")
      .eq("user_id", userId)
      .in("status", ["queued", "discovering", "enriching", "verifying"])
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const seqList = sequences ?? [];
  const seqIds = seqList.map((s) => s.id);
  const seqById = new Map(seqList.map((s) => [s.id, s]));

  const empty = { data: [] as never[], count: 0 };
  const [enrollRes, replyRes, sentRes, repliedEvents, bouncedEvents] = seqIds.length
    ? await Promise.all([
        db.from("enrollments").select("sequence_id,status").in("sequence_id", seqIds),
        db
          .from("enrollments")
          .select(
            "id,sequence_id,ended_at,started_at,contacts(full_name,title,prospect_companies:prospect_companies!contacts_prospect_company_id_fkey(name))",
          )
          .in("sequence_id", seqIds)
          .eq("status", "replied")
          .order("ended_at", { ascending: false, nullsFirst: false })
          .limit(REPLY_LIMIT),
        db
          .from("email_sends")
          .select("id,enrollments!inner(sequence_id)", { count: "exact", head: true })
          .in("enrollments.sequence_id", seqIds)
          .eq("status", "sent")
          .gte("sent_at", weekAgo),
        db
          .from("email_events")
          .select("id,enrollments!inner(sequence_id)", { count: "exact", head: true })
          .in("enrollments.sequence_id", seqIds)
          .eq("type", "replied")
          .gte("occurred_at", weekAgo),
        db
          .from("email_events")
          .select("id,enrollments!inner(sequence_id)", { count: "exact", head: true })
          .in("enrollments.sequence_id", seqIds)
          .eq("type", "bounced")
          .gte("occurred_at", weekAgo),
      ])
    : [empty, empty, empty, empty, empty].map((e) => ({ ...e, error: null }));

  // Replies, with the latest reply snippet when the inbox sync recorded one.
  type ReplyRow = {
    id: string;
    sequence_id: string;
    ended_at: string | null;
    contacts: unknown;
  };
  const replyRows = (replyRes.data ?? []) as unknown as ReplyRow[];
  const snippetByEnrollment = new Map<string, string>();
  if (replyRows.length) {
    const { data: events } = await db
      .from("email_events")
      .select("enrollment_id,metadata,occurred_at")
      .in("enrollment_id", replyRows.map((r) => r.id))
      .eq("type", "replied")
      .order("occurred_at", { ascending: true });
    for (const event of events ?? []) {
      const meta = (event.metadata ?? {}) as Record<string, unknown>;
      const text = str(meta.snippet) ?? str(meta.text) ?? str(meta.body);
      if (text) snippetByEnrollment.set(event.enrollment_id, text);
    }
  }
  const { count: totalReplies } = seqIds.length
    ? await db
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .in("sequence_id", seqIds)
        .eq("status", "replied")
    : { count: 0 };

  const enrolledBy = new Map<string, { total: number; replied: number }>();
  for (const row of (enrollRes.data ?? []) as { sequence_id: string; status: string }[]) {
    const entry = enrolledBy.get(row.sequence_id) ?? { total: 0, replied: 0 };
    entry.total += 1;
    if (row.status === "replied") entry.replied += 1;
    enrolledBy.set(row.sequence_id, entry);
  }

  const sent = sentRes.count ?? 0;
  const repliedWeek = repliedEvents.count ?? 0;
  const bouncedWeek = bouncedEvents.count ?? 0;

  const run = runs?.[0];
  const runList = one(run?.prospect_lists as { name?: string } | { name?: string }[] | null);
  const runPct = run && run.target_count > 0 ? Math.min(100, Math.round((run.processed_count / run.target_count) * 100)) : 0;

  const icp = (blueprint?.icp ?? {}) as Partial<CompanyIcp>;
  const personas = (Array.isArray(blueprint?.personas) ? blueprint.personas : []) as CompanyPersona[];
  const competitors = (Array.isArray(blueprint?.competitors) ? blueprint.competitors : []) as string[];

  const domain = (company.website_url ?? "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
  const panel = "rounded-lg border border-[#EEEEEE] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]";

  const activeCampaignCount = seqList.filter((s) => s.status === "active").length;
  const starters: DashboardStarter[] = [];
  if ((totalReplies ?? 0) > 0) {
    starters.push({
      label: `Help me respond to my ${totalReplies} new ${totalReplies === 1 ? "reply" : "replies"}`,
      prompt: `Show me my recent replies and suggest how to respond to each`,
    });
  }
  if (run) {
    starters.push({ label: "Check my active prospecting run", prompt: "How is my current prospecting run going?" });
  }
  if (activeCampaignCount > 0) {
    starters.push({ label: "How are my campaigns performing?", prompt: "Summarize how my active campaigns are performing" });
  }
  if (!blueprint) {
    starters.push({ label: "Help me finish my company blueprint", prompt: "Help me build out my company blueprint" });
  } else if (seqList.length === 0) {
    starters.push({ label: "Create my first campaign", prompt: "Create a campaign for my ICP" });
  }
  starters.push({ label: "Find more leads for my ICP", prompt: "Find leads that match my approved ICP" });

  const greeting = <GreetingHeader replies={totalReplies ?? 0} campaigns={activeCampaignCount} />;

  const footer = (
    <div className="space-y-8">
        <section className="space-y-3">
          <SectionLabel>Replies · {totalReplies ?? 0}</SectionLabel>
          {replyRows.length === 0 ? (
            <p className={`${panel} px-5 py-6 text-sm text-neutral-600`}>
              No replies yet. They&apos;ll show up here as soon as prospects answer.
            </p>
          ) : (
            <ul className="grid gap-2 2xl:grid-cols-2">
              {replyRows.map((row) => {
                const contact = one(row.contacts as Record<string, unknown> | Record<string, unknown>[] | null);
                const name = str(contact?.full_name) ?? "Unknown contact";
                const pc = one(contact?.prospect_companies as Record<string, unknown> | Record<string, unknown>[] | null);
                const snippet = snippetByEnrollment.get(row.id);
                const campaign = seqById.get(row.sequence_id)?.name;
                return (
                  <li key={row.id}>
                    <Link
                      href="/dashboard/prospects"
                      className={`${panel} flex items-center gap-3 px-3 py-3 transition-colors hover:bg-neutral-50`}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-700">
                        {initials(name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">
                          <span className="font-medium text-neutral-900">{name}</span>
                          {str(pc?.name) ? <span className="text-neutral-500"> · {str(pc?.name)}</span> : null}
                        </span>
                        <span className="block truncate text-[12px] text-neutral-500">
                          {snippet ?? `Replied to ${campaign ?? "your campaign"}${row.ended_at ? ` · ${daysAgo(row.ended_at)}` : ""}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <SectionLabel>Campaigns · {seqList.length}</SectionLabel>
            <Link href="/dashboard/campaigns" className="text-[11px] font-semibold text-[#4379EE] hover:text-[#3567D6]">
              All campaigns
            </Link>
          </div>
          {seqList.length === 0 ? (
            <p className={`${panel} px-5 py-6 text-sm text-neutral-600`}>
              No campaigns yet.{" "}
              <Link href="/dashboard/campaigns" className="font-medium text-[#4379EE] hover:underline">
                Create one
              </Link>{" "}
              to start outreach.
            </p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {seqList.map((seq) => {
                const counts = enrolledBy.get(seq.id) ?? { total: 0, replied: 0 };
                const description = str(seq.description) ?? str(seq.pain);
                return (
                  <li key={seq.id}>
                    <Link href={`/dashboard/campaigns?campaign=${seq.id}`} className="block h-full transition-opacity hover:opacity-90">
                      <div className="flex h-full flex-col gap-2 rounded-xl bg-white p-4 shadow-[0px_1px_3px_rgba(0,0,0,0.03)]">
                        <div className="flex items-start gap-2.5">
                          <CampaignIcon
                            campaign={{ name: seq.name, description: str(seq.description) ?? "", pain: str(seq.pain) ?? "" }}
                            storedSvg={str(seq.icon_svg)}
                            className="size-9"
                          />
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate font-heading text-[16px] font-semibold tracking-[-0.04em] text-black">
                              {seq.name}
                            </h3>
                            <p className="text-[11px] font-medium uppercase tracking-wide text-[#4379EE]">{seq.status}</p>
                          </div>
                        </div>
                        {description ? (
                          <p className="line-clamp-2 text-[13px] leading-snug tracking-[-0.03em] text-[#605f5f]">{description}</p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700">
                            {counts.total} {counts.total === 1 ? "contact" : "contacts"}
                          </span>
                          <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700">
                            {counts.replied} {counts.replied === 1 ? "reply" : "replies"}
                          </span>
                          <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700">
                            {seq.sequence_steps?.length ?? 0} steps
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
    </div>
  );

  const aside = (
    <>
        <PricingCardShell className="h-auto p-2" innerClassName="gap-2 p-3 sm:p-3">
          <div className="flex items-start gap-2.5">
            <CompanyFavicon domain={domain} name={company.name ?? undefined} className="mt-0.5 size-8 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#4379EE]">Company blueprint</p>
              <h3 className="mt-0.5 font-heading text-[16px] font-semibold leading-snug tracking-[-0.04em] text-black">
                {company.name ?? "Your company"}
              </h3>
              {domain ? <p className="text-[12px] text-neutral-400">{domain}</p> : null}
            </div>
            {blueprint ? (
              <span
                className={
                  blueprint.approved_at
                    ? "shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                    : "shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700"
                }
              >
                {blueprint.approved_at ? "Active" : "Draft"}
              </span>
            ) : null}
          </div>

          {!blueprint ? (
            <p className="text-[13px] leading-snug text-[#605f5f]">No blueprint yet. Build one so agents know who to target.</p>
          ) : (
            <>
              {blueprint.product_summary ? (
                <p className="text-[13px] leading-snug tracking-[-0.03em] text-[#605f5f]">{blueprint.product_summary}</p>
              ) : null}
              {blueprint.value_prop && blueprint.value_prop !== blueprint.product_summary ? (
                <p className="text-[13px] leading-snug text-[#605f5f]">{blueprint.value_prop}</p>
              ) : null}
              <p className="text-[12px] text-neutral-600">
                <span className="font-medium text-neutral-700">Ideal customer: </span>
                {[icp.industries?.slice(0, 3).join(", "), icp.companySizeRange, icp.geographies?.slice(0, 2).join(", ")]
                  .filter(Boolean)
                  .join(" · ") || "Not set"}
              </p>
              {personas.length > 0 ? (
                <p className="text-[12px] text-neutral-600">
                  <span className="font-medium text-neutral-700">Personas: </span>
                  {personas.slice(0, 5).map((p) => p.title).join(" · ")}
                </p>
              ) : null}
              {competitors.length > 0 ? (
                <p className="text-[12px] text-neutral-600">
                  <span className="font-medium text-neutral-700">Competitors: </span>
                  {competitors.slice(0, 4).join(", ")}
                </p>
              ) : null}
            </>
          )}
          <div className="flex items-center justify-between pt-1 text-[11px] text-neutral-500">
            <span>
              {blueprint ? `${blueprint.edited_by_user ? "Edited" : "Generated"} ${daysAgo(blueprint.generated_at) ?? ""}` : ""}
            </span>
            <Link href="/setup" className="font-semibold text-[#4379EE] hover:text-[#3567D6]">
              {blueprint ? "Review" : "Build it"}
            </Link>
          </div>
        </PricingCardShell>

        {run ? (
          <section className={`${panel} p-4`}>
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-neutral-900">Active run</h2>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium capitalize text-neutral-700">
                <span className="size-1.5 animate-pulse rounded-full bg-[#4379EE]" aria-hidden />
                {run.status}
              </span>
            </div>
            {runList?.name ? <p className="mt-2 truncate text-[12px] text-neutral-500">{runList.name}</p> : null}
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-[#4379EE]" style={{ width: `${runPct}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-neutral-500">
              <span>
                {run.processed_count} / {run.target_count}
              </span>
              <span>{run.contact_count} contacts</span>
            </div>
          </section>
        ) : null}

        <section className={`${panel} p-4`}>
          <h2 className="text-[13px] font-semibold text-neutral-900">This week</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
            {[
              { label: "emails sent", value: sent.toLocaleString() },
              { label: "reply rate", value: pct(repliedWeek, sent) },
              { label: "replies", value: repliedWeek.toLocaleString() },
              { label: "bounce rate", value: pct(bouncedWeek, sent) },
            ].map((stat) => (
              <div key={stat.label}>
                <dd className="text-xl font-semibold tabular-nums text-neutral-900">{stat.value}</dd>
                <dt className="text-[11px] text-neutral-500">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </section>
    </>
  );

  return <DashboardHomeShell greeting={greeting} starters={starters} footer={footer} aside={aside} />;
}
