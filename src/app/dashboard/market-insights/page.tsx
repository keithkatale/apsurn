import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/auth/session";
import { MarketInsightsWorkspace } from "@/components/market/MarketInsightsWorkspace";

export default async function MarketInsightsPage() {
  const supabase = createAdminClient();
  const userId = await getCurrentUserId();

  const { data: company } = await supabase.from("companies").select("id").eq("user_id", userId).maybeSingle();

  if (!company) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
        <p className="font-medium text-neutral-900">No company blueprint yet</p>
        <p className="mt-1 text-sm text-neutral-500">
          Build and approve your company blueprint before tracking market mentions.
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

  const [{ data: keywords }, { data: accounts }, { data: mentions }] = await Promise.all([
    supabase.from("market_keywords").select("*").eq("company_id", company.id).order("created_at", { ascending: false }),
    supabase.from("market_accounts").select("*").eq("company_id", company.id).order("created_at", { ascending: false }),
    supabase
      .from("market_mentions")
      .select("*, market_keywords(keyword)")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const nextCursor = mentions && mentions.length === 20 ? mentions[mentions.length - 1].created_at : null;

  return (
    <MarketInsightsWorkspace
      initialKeywords={keywords ?? []}
      initialAccounts={accounts ?? []}
      initialMentions={mentions ?? []}
      initialCursor={nextCursor}
    />
  );
}

export const dynamic = "force-dynamic";
