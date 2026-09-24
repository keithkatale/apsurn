"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

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

export function CopilotSidebar({
  conversations,
  activeId,
  loading,
  onSelect,
  onNewThread,
  onRename,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNewThread: () => void;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function startRename(id: string, currentTitle: string) {
    setEditingId(id);
    setDraft(currentTitle);
  }

  function commitRename() {
    const id = editingId;
    const title = draft.trim();
    setEditingId(null);
    if (id && title) onRename(id, title);
  }

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--copilot-card-border)] bg-[var(--copilot-card)]">
      <div className="p-3">
        <button
          type="button"
          onClick={onNewThread}
          className="flex w-full items-center gap-2 rounded-lg border border-[var(--copilot-card-border)] bg-[var(--copilot-background)] px-3 py-2 text-[14px] font-medium text-[var(--copilot-foreground)] transition-colors hover:bg-[var(--copilot-dropdown-hover)]"
        >
          <Plus size={16} />
          New thread
        </button>
      </div>

      <p className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--copilot-muted)]">Tasks</p>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading && conversations.length === 0 ? (
          <div className="px-2 py-6 text-center text-[13px] text-[var(--copilot-muted)]">Loading…</div>
        ) : conversations.length === 0 ? (
          <div className="px-2 py-6 text-center text-[13px] text-[var(--copilot-muted)]">No conversations yet.</div>
        ) : (
          <ul className="space-y-0.5">
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
                    className="w-full rounded-lg border border-[var(--copilot-accent-dim)] bg-[var(--copilot-background)] px-2.5 py-1.5 text-[13.5px] font-medium text-[var(--copilot-foreground)] outline-none"
                  />
                </li>
              ) : (
                <li key={c.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-[13.5px] font-medium text-[var(--copilot-foreground)] transition-colors ${
                      activeId === c.id ? "bg-[var(--copilot-dropdown-hover)]" : "hover:bg-[var(--copilot-dropdown-hover)]"
                    }`}
                    title={c.title ?? "New conversation"}
                  >
                    {c.title ?? "New conversation"}
                  </button>
                  <RowMenu onRename={() => startRename(c.id, c.title ?? "")} onDelete={() => onDelete(c.id)} />
                </li>
              )
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
