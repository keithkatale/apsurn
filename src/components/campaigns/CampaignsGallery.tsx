"use client";

import { CircleDot, FileEdit, PauseCircle, Plus, type LucideIcon } from "lucide-react";
import { CompanyFavicon } from "@/components/prospects/CompanyFavicon";
import { ContactAvatar } from "@/components/prospects/ContactAvatar";
import { PreviewTableCard } from "@/components/ui/PreviewTableCard";

interface GalleryLead {
  id: string;
  fullName: string | null;
  email: string | null;
  linkedinUrl: string | null;
  companyName: string;
  companyDomain: string;
}

interface GalleryCampaign {
  id: string;
  name: string;
  status: string;
  contactIds: string[];
  steps: Array<{ id: string; stepOrder: number; subject: string | null }>;
}

const STATUS_PIN: Record<string, { icon: LucideIcon; label: string }> = {
  active: { icon: CircleDot, label: "Active" },
  paused: { icon: PauseCircle, label: "Paused" },
  draft: { icon: FileEdit, label: "Draft" },
};

const PREVIEW_ROWS = 4;

/** Every campaign as a card with a peek at who is in it (or, before anyone is, the emails it will send). */
export function CampaignsGallery({
  campaigns,
  leads,
  onOpen,
  onCreate,
  creating = false,
}: {
  campaigns: GalleryCampaign[];
  leads: Record<string, GalleryLead>;
  onOpen: (id: string) => void;
  onCreate: () => void;
  creating?: boolean;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="grid gap-3 px-3 py-3 sm:grid-cols-2 md:px-4 xl:grid-cols-3">
        {campaigns.map((campaign) => {
          const people = campaign.contactIds.map((id) => leads[id]).filter(Boolean);
          const steps = [...campaign.steps].sort((a, b) => a.stepOrder - b.stepOrder);
          const pin = STATUS_PIN[campaign.status] ?? STATUS_PIN.draft;
          const meta = `${people.length} contact${people.length === 1 ? "" : "s"} · ${steps.length} email${steps.length === 1 ? "" : "s"}`;
          return people.length > 0 ? (
            <PreviewTableCard
              key={campaign.id}
              title={campaign.name}
              meta={meta}
              pin={pin}
              headers={["Name", "Company"]}
              onOpen={() => onOpen(campaign.id)}
              rows={people.slice(0, PREVIEW_ROWS).map((person) => ({
                key: person.id,
                left: (
                  <span className="flex min-w-0 items-center gap-2">
                    <ContactAvatar name={person.fullName} linkedinUrl={person.linkedinUrl} email={person.email} className="size-5" />
                    <span className="truncate font-medium text-neutral-800">{person.fullName || "—"}</span>
                  </span>
                ),
                right: (
                  <span className="flex min-w-0 items-center gap-2 text-neutral-500">
                    <CompanyFavicon domain={person.companyDomain} name={person.companyName} className="size-4" />
                    <span className="truncate">{person.companyName}</span>
                  </span>
                ),
              }))}
            />
          ) : (
            <PreviewTableCard
              key={campaign.id}
              title={campaign.name}
              meta={meta}
              pin={pin}
              headers={["Step", "Subject"]}
              emptyText="No emails yet"
              onOpen={() => onOpen(campaign.id)}
              rows={steps.slice(0, PREVIEW_ROWS).map((step, index) => ({
                key: step.id,
                left: <span className="font-medium text-neutral-800">Email {index + 1}</span>,
                right: <span className="block truncate text-neutral-500">{step.subject || "Untitled"}</span>,
              }))}
            />
          );
        })}
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="flex h-[260px] flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-neutral-300 text-neutral-500 hover:text-neutral-900 disabled:opacity-60"
        >
          <span className="inline-flex size-9 items-center justify-center rounded-full border border-neutral-300">
            <Plus className="size-4" />
          </span>
          <span className="text-[13px] font-medium">New campaign</span>
        </button>
      </div>
    </div>
  );
}
