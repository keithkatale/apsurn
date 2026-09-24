"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { OUTREACH_OPTIONS, type OutreachState } from "./types";

const TONES: Record<OutreachState, string> = {
  in_campaign: "bg-[#E8F1FC] text-[#4379EE]",
  not_in_campaign: "bg-neutral-100 text-neutral-600",
  contacted: "bg-emerald-50 text-emerald-700",
  not_contacted: "bg-amber-50 text-amber-800",
};

export function OutreachPicker({ contactId, value }: { contactId: string; value: OutreachState }) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setCurrent(value), [value]);

  const label = OUTREACH_OPTIONS.find((option) => option.id === current)?.label ?? "Not contacted";

  async function choose(next: OutreachState) {
    setOpen(false);
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: [contactId], outreach: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not update outreach");
      router.refresh();
    } catch (err) {
      setCurrent(previous);
      setError(err instanceof Error ? err.message : "Could not update outreach");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        disabled={saving}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((valueOpen) => !valueOpen)}
        className={`rounded-full px-3 py-1 text-[12px] font-medium disabled:opacity-60 ${TONES[current]}`}
      >
        {label}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-50 mt-1 flex min-w-[11rem] flex-col gap-1 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-md" role="listbox">
            {OUTREACH_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={option.id === current}
                onClick={() => void choose(option.id)}
                className={`rounded-full px-3 py-1 text-left text-[12px] font-medium ${TONES[option.id]} ${option.id === current ? "ring-1 ring-neutral-300" : ""}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {error ? <span className="mt-1 block max-w-[11rem] text-[11px] text-red-600">{error}</span> : null}
    </div>
  );
}
