"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LEAD_STATUSES, type LeadStatus } from "./types";

const TONES: Record<LeadStatus, string> = {
  new: "bg-neutral-100 text-neutral-600",
  qualified: "bg-[#E8F1FC] text-[#4379EE]",
  contacted: "bg-emerald-50 text-emerald-700",
  replied: "bg-violet-50 text-violet-700",
  won: "bg-green-50 text-green-700",
  lost: "bg-rose-50 text-rose-700",
};

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
        className={`rounded-full px-3 py-1 text-[12px] font-medium capitalize disabled:opacity-60 ${TONES[current]}`}
      >
        {current}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-50 mt-1 flex min-w-[8.5rem] flex-col gap-1 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-md">
            {LEAD_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => choose(status)}
                className={`rounded-full px-3 py-1 text-left text-[12px] font-medium capitalize ${TONES[status]} ${
                  status === current ? "ring-1 ring-neutral-300" : ""
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
