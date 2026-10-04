"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { CampaignIcon } from "@/components/campaigns/CampaignIcon";

export type CampaignNavItem = {
  id: string;
  name: string;
  icon: string;
  description?: string | null;
};

type CampaignActions = {
  create: () => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
};

type CampaignNav = {
  campaigns: CampaignNavItem[];
  activeId: string | null;
  select: (id: string | null) => void;
  sync: (items: CampaignNavItem[]) => void;
  bind: (actions: CampaignActions) => void;
  create: () => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
};

const CampaignNavContext = createContext<CampaignNav | null>(null);

export function CampaignsNavProvider({ children }: { children: ReactNode }) {
  const [campaigns, setCampaigns] = useState<CampaignNavItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const actions = useRef<CampaignActions>({
    create: () => {},
    rename: () => {},
    remove: () => {},
  });

  const sync = useCallback((items: CampaignNavItem[]) => {
    setCampaigns((prev) => {
      if (
        prev.length === items.length &&
        prev.every(
          (item, index) =>
            item.id === items[index]?.id &&
            item.name === items[index]?.name &&
            item.icon === items[index]?.icon &&
            item.description === items[index]?.description,
        )
      ) {
        return prev;
      }
      return items;
    });
  }, []);

  const bind = useCallback((next: CampaignActions) => {
    actions.current = next;
  }, []);

  const value = useMemo<CampaignNav>(
    () => ({
      campaigns,
      activeId,
      select: setActiveId,
      sync,
      bind,
      create: () => actions.current.create(),
      rename: (id, name) => actions.current.rename(id, name),
      remove: (id) => actions.current.remove(id),
    }),
    [campaigns, activeId, sync, bind],
  );

  return <CampaignNavContext.Provider value={value}>{children}</CampaignNavContext.Provider>;
}

export function useCampaignNav() {
  const value = useContext(CampaignNavContext);
  if (!value) throw new Error("useCampaignNav must be used within CampaignsNavProvider");
  return value;
}

function RowMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 160) });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          if (open) setOpen(false);
          else openMenu();
        }}
        aria-label="Campaign actions"
        className="shrink-0 rounded-md p-1 text-neutral-400 opacity-0 transition-opacity hover:bg-neutral-100 hover:text-neutral-800 group-hover:opacity-100 data-[open=true]:opacity-100"
        data-open={open}
      >
        <MoreHorizontal size={14} />
      </button>
      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={(event) => { event.stopPropagation(); setOpen(false); }} />
            <div
              onClick={(event) => event.stopPropagation()}
              style={{ top: pos.top, left: pos.left }}
              className="fixed z-50 flex w-40 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
            >
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onRename();
                }}
                className="flex items-center gap-2 px-3 py-2 text-left text-[13px] text-neutral-700 hover:bg-neutral-50"
              >
                <Pencil size={13} />
                Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="flex items-center gap-2 px-3 py-2 text-left text-[13px] text-red-600 hover:bg-neutral-50"
              >
                <Trash2 size={13} />
                Delete
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

export function CampaignsNavMenu() {
  const { campaigns, activeId, select, create, rename, remove } = useCampaignNav();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function commitRename() {
    const id = editingId;
    const title = draft.trim();
    setEditingId(null);
    if (id && title) rename(id, title);
  }

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between px-3 pb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Campaigns</p>
        <button
          type="button"
          onClick={() => create()}
          aria-label="New campaign"
          title="New campaign"
          className="inline-flex size-5 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
        >
          <Plus size={13} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {campaigns.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-neutral-400">No campaigns yet.</p>
        ) : (
          <ul className="space-y-px">
            {campaigns.map((item) =>
              editingId === item.id ? (
                <li key={item.id} className="px-1">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRename();
                      if (event.key === "Escape") setEditingId(null);
                    }}
                    maxLength={80}
                    className="w-full rounded-md border border-[#4379EE] bg-white px-2 py-1 text-[12px] text-neutral-900 outline-none"
                  />
                </li>
              ) : (
                <li key={item.id} className="group flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => select(item.id)}
                    title={item.name}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-1.5 text-left text-[12px] transition-colors ${
                      activeId === item.id
                        ? "bg-neutral-100 font-medium text-neutral-900"
                        : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                    }`}
                  >
                    <CampaignIcon
                      campaign={{ name: item.name, description: item.description }}
                      storedSvg={item.icon}
                      className="!text-[16px]"
                    />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  </button>
                  <RowMenu
                    onRename={() => {
                      setEditingId(item.id);
                      setDraft(item.name);
                    }}
                    onDelete={() => remove(item.id)}
                  />
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

export function CampaignsNavChips() {
  const { campaigns, activeId, select, create } = useCampaignNav();
  return (
    <div className="flex gap-1 overflow-x-auto px-3 pb-2">
      <button
        type="button"
        onClick={() => create()}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-[12px] font-medium text-neutral-700"
      >
        <Plus size={12} />
        New
      </button>
      {campaigns.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => select(item.id)}
          className={`inline-flex max-w-44 shrink-0 items-center gap-1 truncate rounded-full px-2.5 py-1 text-[12px] ${
            activeId === item.id ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-500"
          }`}
        >
          <CampaignIcon campaign={{ name: item.name }} storedSvg={item.icon} className="!text-[14px]" />
          <span className="truncate">{item.name}</span>
        </button>
      ))}
    </div>
  );
}
