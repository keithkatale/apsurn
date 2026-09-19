"use client";

import { useState } from "react";
import { Check, ChevronDown, Plus, UserCheck, UserPlus, UserRound } from "lucide-react";

export interface FilterOption {
  id: string;
  label: string;
  avatarUrl?: string | null;
  isFollowed?: boolean;
}

function OptionAvatar({ url }: { url: string | null | undefined }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <UserRound className="size-3" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="size-5 shrink-0 rounded-full object-cover" onError={() => setFailed(true)} />
  );
}

export function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onToggleFollow,
}: {
  label: string;
  options: FilterOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleFollow?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = selected.size;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
          activeCount > 0 ? "border-blue-200 bg-blue-50 text-blue-700" : "border-dashed border-neutral-300 text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
        }`}
      >
        {activeCount === 0 && <Plus className="size-3" />}
        {label}
        {activeCount > 0 ? ` (${activeCount})` : ""}
        <ChevronDown className="size-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-9 z-20 flex max-h-72 w-64 flex-col overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1 shadow-lg">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-xs text-neutral-400">Nothing to filter by yet.</p>
            ) : (
              options.map((option) => (
                <div key={option.id} className="flex items-center gap-1 px-1.5 py-0.5 hover:bg-neutral-50">
                  <button
                    type="button"
                    onClick={() => onToggle(option.id)}
                    className="flex flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-sm text-neutral-700"
                  >
                    {option.avatarUrl !== undefined && <OptionAvatar url={option.avatarUrl} />}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {selected.has(option.id) && <Check className="size-3.5 shrink-0 text-blue-700" />}
                  </button>
                  {onToggleFollow && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFollow(option.id);
                      }}
                      aria-label={option.isFollowed ? "Unfollow" : "Follow"}
                      title={option.isFollowed ? "Following" : "Follow"}
                      className={`shrink-0 rounded-full p-1 ${option.isFollowed ? "text-emerald-700" : "text-neutral-400 hover:text-neutral-700"}`}
                    >
                      {option.isFollowed ? <UserCheck className="size-3.5" /> : <UserPlus className="size-3.5" />}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
