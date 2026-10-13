"use client";

import { useState } from "react";
import { Bot, FileUp, Layers, Megaphone, PenLine, Plus, Radar, Sparkles, type LucideIcon } from "lucide-react";
import { PreviewTableCard } from "@/components/ui/PreviewTableCard";
import { LIST_SOURCE_LABEL, type ListSource, type ProspectListInfo } from "@/lib/prospects/lists";
import { CompanyFavicon } from "@/components/prospects/CompanyFavicon";
import { ContactAvatar } from "@/components/prospects/ContactAvatar";
import type { ProspectRow } from "@/components/prospects/types";

const SOURCE_ICON: Record<ListSource, LucideIcon> = {
  ai: Sparkles,
  upload: FileUp,
  campaign: Megaphone,
  copilot: Bot,
  market: Radar,
  manual: PenLine,
};

const PREVIEW_ROWS = 4;

function ListCard({
  title,
  pin,
  prospects,
  onOpen,
}: {
  title: string;
  pin: { icon: LucideIcon; label: string };
  prospects: ProspectRow[];
  onOpen: () => void;
}) {
  const rows = prospects.flatMap((company) => company.contacts.map((contact) => ({ contact, company })));
  return (
    <PreviewTableCard
      title={title}
      meta={`${rows.length} contact${rows.length === 1 ? "" : "s"}`}
      pin={pin}
      headers={["Name", "Company"]}
      onOpen={onOpen}
      rows={rows.slice(0, PREVIEW_ROWS).map(({ contact, company }) => ({
        key: contact.id,
        left: (
          <span className="flex min-w-0 items-center gap-2">
            <ContactAvatar name={contact.full_name} linkedinUrl={contact.linkedin_url} email={contact.email} photoUrl={contact.photo_url} className="size-5" />
            <span className="truncate font-medium text-neutral-800">{contact.full_name || "—"}</span>
          </span>
        ),
        right: (
          <span className="flex min-w-0 items-center gap-2 text-neutral-500">
            <CompanyFavicon domain={company.domain} name={company.name} className="size-4" />
            <span className="truncate">{company.name}</span>
          </span>
        ),
      }))}
    />
  );
}

export function ProspectListsGrid({
  lists,
  prospects,
  onOpen,
  onCreate,
}: {
  lists: ProspectListInfo[];
  prospects: ProspectRow[];
  onOpen: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onCreate(trimmed);
      setName("");
      setNaming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <ListCard
        title="All prospects"
        pin={{ icon: Layers, label: "Everything" }}
        prospects={prospects}
        onOpen={() => onOpen("all")}
      />
      {lists
        .filter((list) => list.source === "manual" || prospects.some((company) => company.list_id === list.id))
        .map((list) => (
        <ListCard
          key={list.id}
          title={list.name}
          pin={{ icon: SOURCE_ICON[list.source], label: LIST_SOURCE_LABEL[list.source] }}
          prospects={prospects.filter((company) => company.list_id === list.id)}
          onOpen={() => onOpen(list.id)}
        />
      ))}
      <div className="flex h-[260px] flex-col items-center justify-center gap-3 rounded-[10px] border border-dashed border-neutral-300 p-4">
        {naming ? (
          <form
            className="flex w-full flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="List name, e.g. Seed-stage fintech"
              maxLength={120}
              className="input w-full py-1.5"
            />
            <div className="flex gap-2">
              <button type="submit" disabled={!name.trim() || busy} className="rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50">
                {busy ? "Creating…" : "Create list"}
              </button>
              <button type="button" onClick={() => setNaming(false)} className="rounded-full px-3 py-1.5 text-[12px] font-medium text-neutral-600 hover:bg-neutral-100">
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setNaming(true)} className="flex flex-col items-center gap-2 text-neutral-500 hover:text-neutral-900">
            <span className="inline-flex size-9 items-center justify-center rounded-full border border-neutral-300">
              <Plus className="size-4" />
            </span>
            <span className="text-[13px] font-medium">New list</span>
          </button>
        )}
      </div>
    </div>
  );
}
