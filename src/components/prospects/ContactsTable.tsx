"use client";

import { useMemo } from "react";
import { LeadStatusPicker } from "./LeadStatusPicker";
import type { ContactRow, ProspectRow } from "./types";

export type FlatRow = {
  contact: ContactRow;
  company: ProspectRow;
};

export function ContactsTable({
  prospects,
  selected,
  onSelectedChange,
  onOpenProfile,
}: {
  prospects: ProspectRow[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  onOpenProfile: (row: FlatRow) => void;
}) {
  const rows = useMemo<FlatRow[]>(
    () =>
      prospects.flatMap((company) =>
        company.contacts.map((contact) => ({ contact, company })),
      ),
    [prospects],
  );

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.contact.id));
  const someSelected = rows.some((r) => selected.has(r.contact.id));

  function toggle(contactId: string) {
    const next = new Set(selected);
    if (next.has(contactId)) next.delete(contactId);
    else next.add(contactId);
    onSelectedChange(next);
  }

  function toggleAll() {
    if (allSelected) {
      onSelectedChange(new Set());
      return;
    }
    onSelectedChange(new Set(rows.map((r) => r.contact.id)));
  }

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm leading-tight">
          <thead>
            <tr className="border-b border-blue-100 bg-blue-50 text-left text-[11px] font-medium uppercase tracking-wide text-blue-700">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={toggleAll}
                  className="size-3.5 rounded border-neutral-300"
                  aria-label="Select all"
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Title</th>
              <th className="px-3 py-2.5 font-medium">Company</th>
              <th className="px-3 py-2.5 font-medium">Email</th>
              <th className="px-3 py-2.5 font-medium">Phone</th>
              <th className="px-3 py-2.5 font-medium">Stage</th>
              <th className="px-3 py-2.5 font-medium">Why</th>
              <th className="px-3 py-2.5 font-medium">Fit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ contact, company }, index) => {
              const isSelected = selected.has(contact.id);
              return (
                <tr
                  key={contact.id}
                  className={`border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50/80 ${
                    isSelected
                      ? "bg-neutral-50"
                      : index % 2 === 1
                        ? "bg-neutral-50/40"
                        : "bg-white"
                  }`}
                >
                  <td className="px-3 py-3 align-middle">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(contact.id)}
                      className="size-3.5 rounded border-neutral-300"
                      aria-label={`Select ${contact.full_name ?? "contact"}`}
                    />
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-3 align-middle">
                    <button
                      type="button"
                      className="truncate font-medium text-neutral-900 hover:underline"
                      onClick={() => onOpenProfile({ contact, company })}
                    >
                      {contact.full_name || "—"}
                    </button>
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-3 align-middle text-neutral-600">
                    {contact.title || "—"}
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-3 align-middle text-neutral-700">
                    {company.name}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-3 align-middle text-neutral-600">
                    {contact.email ? (
                      <span>
                        {contact.email}
                        {contact.email_status !== "unverified" && (
                          <span className="ml-1 text-[11px] text-neutral-400">
                            {contact.email_status}
                          </span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-[120px] truncate px-3 py-3 align-middle text-neutral-600">
                    {contact.phone || "—"}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <LeadStatusPicker contactId={contact.id} value={contact.lead_status} />
                  </td>
                  <td
                    className="max-w-[200px] truncate px-3 py-3 align-middle text-neutral-500"
                    title={contact.qualify_reason ?? undefined}
                  >
                    {contact.qualify_reason || "—"}
                  </td>
                  <td className="px-3 py-3 align-middle tabular-nums text-neutral-600">
                    {company.icp_fit_score ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-3 pb-2 text-[11px] text-neutral-400">
        {rows.length} contact{rows.length === 1 ? "" : "s"} · {prospects.length} compan
        {prospects.length === 1 ? "y" : "ies"}
      </p>
    </div>
  );
}
