import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/auth/session";
import { NewSearchForm } from "@/components/prospects/NewSearchForm";
import { ContactsTable } from "@/components/prospects/ContactsTable";
import type { ProspectRow } from "@/components/prospects/types";

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const openNewSearch = params.new !== undefined;

  const supabase = createAdminClient();
  const userId = await getCurrentUserId();

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  const { data: blueprint } = company
    ? await supabase
        .from("company_blueprints")
        .select("icp, personas")
        .eq("company_id", company.id)
        .maybeSingle()
    : { data: null };

  const icp = (blueprint?.icp as {
    industries?: string[];
    companySizeRange?: string;
    geographies?: string[];
  }) ?? {};
  const personas = (blueprint?.personas as Array<{ title: string }> | undefined) ?? [];

  const { data: lists } = company
    ? await supabase
        .from("prospect_lists")
        .select("*, prospect_companies(*, contacts(*))")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Prospects</h1>
          <p className="text-sm text-neutral-500">
            Search for companies and contacts matching your ICP.
          </p>
        </div>
        {company && (
          <NewSearchForm
            defaultIndustries={icp.industries ?? []}
            defaultGeographies={icp.geographies ?? []}
            defaultCompanySizeRange={icp.companySizeRange ?? ""}
            defaultPersonas={personas.map((p) => p.title).filter(Boolean)}
            defaultOpen={openNewSearch}
          />
        )}
      </header>

      {!company && (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="font-medium text-neutral-900">No company blueprint yet</p>
          <p className="mt-1 text-sm text-neutral-500">
            Build and approve your company blueprint before running prospecting.
          </p>
          <div className="mt-4 flex justify-center">
            <Link
              href="/setup"
              className="inline-flex items-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Go to Setup
            </Link>
          </div>
        </div>
      )}

      {(!lists || lists.length === 0) && company ? (
        <EmptyState
          title="No lists yet"
          description="Run a prospecting search above to build your first list of companies and contacts."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {(lists ?? []).map((list) => (
            <ListCard key={list.id} list={list} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ListRow {
  id: string;
  name: string;
  status: string;
  requested_count: number;
  found_count: number;
  error: string | null;
  created_at: string;
  prospect_companies: ProspectRow[];
}

function ListCard({ list }: { list: ListRow }) {
  const prospects: ProspectRow[] = (list.prospect_companies ?? [])
    .filter((p) => !p.archived_at)
    .map((p) => ({ ...p, contacts: (p.contacts ?? []).filter((c) => !c.archived_at) }));

  return (
    <div className="overflow-hidden border border-neutral-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium text-neutral-900">{list.name}</span>
          <span className="shrink-0 text-[12px] text-neutral-500">
            {list.found_count}/{list.requested_count} companies
          </span>
        </div>
        <StatusBadge status={list.status} />
      </div>

      {list.status === "failed" && list.error && (
        <p className="border-b border-neutral-100 px-3 py-2 text-[13px] text-red-600">{list.error}</p>
      )}

      {prospects.length > 0 && (
        <div className="p-0">
          <ContactsTable prospects={prospects} />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
      {status}
    </span>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
      <p className="font-medium text-neutral-900">{title}</p>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
    </div>
  );
}

export const dynamic = "force-dynamic";
