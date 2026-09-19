import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/auth/session";
import { ProspectsWorkspace } from "@/components/prospects/ProspectsWorkspace";

export default async function ProspectsPage() {
  const supabase = createAdminClient();
  const userId = await getCurrentUserId();

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
            className="inline-flex items-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Go to Setup
          </Link>
        </div>
      </div>
    );
  }

  const { data: companies, error } = await supabase
    .from("prospect_companies")
    .select("*, contacts!contacts_prospect_company_id_fkey(*)")
    .eq("company_id", company.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) console.error("[prospects] failed to load companies:", error);

  return <ProspectsWorkspace initialCompanies={companies ?? []} />;
}

export const dynamic = "force-dynamic";
