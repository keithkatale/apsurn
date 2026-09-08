import { Mail } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserId } from "@/lib/auth/session";

export default async function InboxesPage() {
  const supabase = createAdminClient();
  const userId = await getCurrentUserId();

  const { data: inboxes } = await supabase
    .from("connected_inboxes")
    .select("id, provider, email_address, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-neutral-900">Inboxes</h1>
        <p className="text-neutral-600">
          Connect the inbox outreach sends from — emails go out as genuinely from you.
        </p>
      </header>

      {!inboxes || inboxes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
          <p className="font-medium text-neutral-900">No inbox connected</p>
          <p className="mt-1 text-sm text-neutral-500">
            Gmail OAuth connection hasn&apos;t been built yet. Once it is, you&apos;ll connect
            your Gmail (and later Outlook) account here to send and track outreach.
          </p>
          <ThreeDButton
            variant="solid"
            disabled
            title="Gmail connection isn't built yet"
            className="mt-4"
          >
            <Mail className="size-4" />
            <span>Connect Gmail</span>
          </ThreeDButton>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {inboxes.map((inbox) => (
            <div
              key={inbox.id}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4"
            >
              <div>
                <div className="font-medium text-neutral-900">{inbox.email_address}</div>
                <div className="text-sm text-neutral-500">{inbox.provider}</div>
              </div>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                {inbox.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const dynamic = "force-dynamic";
