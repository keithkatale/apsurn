"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LEAD_STATUSES, type LeadStatus } from "./types";

export function LeadStatusPicker({ contactId, value }: { contactId: string; value: LeadStatus }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(value);
  const [saving, setSaving] = useState(false);

  async function choose(next: LeadStatus) {
    setOpen(false);
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    setSaving(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [contactId], lead_status: next }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      router.refresh();
    } catch {
      setCurrent(previous);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={saving}
        onClick={() => setOpen((o) => !o)}
        className="rounded px-1 py-0.5 text-[12px] capitalize text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
      >
        {current}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-50 mt-0.5 flex min-w-[7.5rem] flex-col overflow-hidden rounded border border-neutral-200 bg-white shadow-sm">
            {LEAD_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => choose(status)}
                className={`px-2 py-1 text-left text-[12px] capitalize hover:bg-neutral-50 ${
                  status === current ? "bg-neutral-50 font-medium text-neutral-900" : "text-neutral-700"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
