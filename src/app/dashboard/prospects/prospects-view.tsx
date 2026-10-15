import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserIdOrRedirect } from "@/lib/auth/session";
import { ProspectsWorkspace } from "@/components/prospects/ProspectsWorkspace";
import type { ProspectRow } from "@/components/prospects/types";
import { loadProspectCompanies, loadProspectLists } from "@/lib/prospects/load";

export async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ find?: string }>;
}) {
  const params = await searchParams;
  const supabase = createAdminClient();
  const userId = await getCurrentUserIdOrRedirect("/dashboard/prospects");

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!company) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
        <p className="font-medium text-neutral-900">No company blueprint yet</p>
        <p className="mt-1 text-sm text-neutral-500">
          Build and approve your company blueprint before running prospecting.
        </p>
        <div className="mt-4 flex justify-center">
          <Link
            href="/setup"
            className="inline-flex items-center rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Go to Setup
          </Link>
        </div>
      </div>
    );
  }

  let companies: Awaited<ReturnType<typeof loadProspectCompanies>> = [];
  let lists: Awaited<ReturnType<typeof loadProspectLists>> = [];
  try {
    [companies, lists] = await Promise.all([loadProspectCompanies(supabase, company.id), loadProspectLists(supabase, company.id)]);
  } catch (error) {
    console.error("[prospects] failed to load companies:", error);
  }

  return <ProspectsWorkspace initialCompanies={companies as unknown as ProspectRow[]} initialLists={lists} openFind={params.find === "1"} />;
}


