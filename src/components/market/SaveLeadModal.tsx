"use client";

import { useEffect, useState } from "react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import type { MarketMentionWithKeyword } from "./types";

export function SaveLeadModal({
  mention,
  onClose,
  onSave,
}: {
  mention: MarketMentionWithKeyword;
  onClose: () => void;
  onSave: (input: { accountName: string; note: string }) => Promise<void>;
}) {
  const [accountName, setAccountName] = useState(
    mention.saved_account_name || mention.author_name || mention.author_handle || ""
  );
  const [note, setNote] = useState(mention.save_note ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit() {
    const name = accountName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      await onSave({ accountName: name, note: note.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-labelledby="save-lead-title"
        className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="save-lead-title" className="text-base font-semibold text-neutral-900">
          {mention.is_saved ? "Update saved lead" : "Save lead"}
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          Keep the account name, post, and a note so you can remember why this lead matters.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600">Account name</span>
            <input
              className="input"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Exact name of the account"
              autoFocus
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600">Post URL</span>
            <a
              href={mention.url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-sm text-blue-700 hover:underline"
            >
              {mention.url}
            </a>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600">Post</span>
            <p className="max-h-28 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              {mention.content}
            </p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600">Note (optional)</span>
            <textarea
              className="input min-h-24 resize-y"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why are you saving this lead?"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <ThreeDButton type="button" variant="soft" size="sm" onClick={onClose}>
            Cancel
          </ThreeDButton>
          <ThreeDButton type="button" variant="solid" size="sm" disabled={!accountName.trim() || saving} onClick={submit}>
            {saving ? "Saving…" : mention.is_saved ? "Update" : "Save lead"}
          </ThreeDButton>
        </div>
      </div>
    </div>
  );
}
