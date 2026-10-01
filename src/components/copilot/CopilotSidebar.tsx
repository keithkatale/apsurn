"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useCopilotThreads } from "@/components/copilot/CopilotThreadsProvider";

export interface ConversationSummary {
  id: string;
  title: string | null;
  updated_at: string;
}

function RowMenu({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
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
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openMenu();
        }}
        aria-label="Task actions"
        className="shrink-0 rounded-md p-1 text-[var(--copilot-muted)] opacity-0 transition-opacity hover:bg-[var(--copilot-dropdown-hover)] group-hover:opacity-100 data-[open=true]:opacity-100"
        data-open={open}
      >
        <MoreHorizontal size={14} />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
            <div
              onClick={(e) => e.stopPropagation()}
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
          document.body
        )}
    </>
  );
}

/** Compact conversation list for the dashboard nav. Smaller type than the main tabs so threads read as a sub-menu. */
export function CopilotThreadsMenu() {
  const { conversations, loading, activeId, select, rename, remove } = useCopilotThreads();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function commitRename() {
    const id = editingId;
    const title = draft.trim();
    setEditingId(null);
    if (id && title) void rename(id, title);
  }

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between px-3 pb-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Conversations</p>
        <button
          type="button"
          onClick={() => select(null)}
          aria-label="New thread"
          title="New thread"
          className="inline-flex size-5 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
        >
          <Plus size={13} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && conversations.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-neutral-400">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-neutral-400">No conversations yet.</p>
        ) : (
          <ul className="space-y-px">
            {conversations.map((c) =>
              editingId === c.id ? (
                <li key={c.id} className="px-1">
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    maxLength={80}
                    className="w-full rounded-md border border-[#4379EE] bg-white px-2 py-1 text-[12px] text-neutral-900 outline-none"
                  />
                </li>
              ) : (
                <li key={c.id} className="group flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => select(c.id)}
                    title={c.title ?? "New conversation"}
                    className={`min-w-0 flex-1 truncate rounded-md px-3 py-1.5 text-left text-[12px] transition-colors ${
                      activeId === c.id
                        ? "bg-neutral-100 font-medium text-neutral-900"
                        : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                    }`}
                  >
                    {c.title ?? "New conversation"}
                  </button>
                  <RowMenu
                    onRename={() => {
                      setEditingId(c.id);
                      setDraft(c.title ?? "");
                    }}
                    onDelete={() => void remove(c.id)}
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

/** Phone-width equivalent of the threads menu: a scrollable row of small chips. */
export function CopilotThreadsChips() {
  const { conversations, activeId, select } = useCopilotThreads();
  return (
    <div className="flex gap-1 overflow-x-auto px-3 pb-2">
      <button
        type="button"
        onClick={() => select(null)}
        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-[12px] font-medium text-neutral-700"
      >
        <Plus size={12} />
        New
      </button>
      {conversations.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => select(c.id)}
          className={`max-w-40 shrink-0 truncate rounded-full px-2.5 py-1 text-[12px] ${
            activeId === c.id ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-500"
          }`}
        >
          {c.title ?? "New conversation"}
        </button>
      ))}
    </div>
  );
}
