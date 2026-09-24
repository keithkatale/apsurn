"use client";

import { useMemo } from "react";
import { CompanyFavicon } from "./CompanyFavicon";
import { ContactAvatar } from "./ContactAvatar";
import { LeadStatusPicker } from "./LeadStatusPicker";
import { OutreachPicker } from "./OutreachPicker";
import { OUTREACH_OPTIONS, type ContactRow, type OutreachState, type ProspectRow } from "./types";

export type FlatRow = {
  contact: ContactRow;
  company: ProspectRow;
};

export function ContactsTable({
  prospects,
  selected,
  onSelectedChange,
  onOpenProfile,
  readOnly = false,
}: {
  prospects: ProspectRow[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  onOpenProfile?: (row: FlatRow) => void;
  readOnly?: boolean;
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
  const showRowCheckboxes = someSelected;

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

  return (
    <div className="flex flex-col gap-2 overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm leading-tight">
          <thead>
            <tr className="border-b border-blue-100 bg-blue-50 text-left text-[11px] font-medium uppercase tracking-wide text-blue-700">
              {!readOnly && (
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
              )}
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Title</th>
              <th className="px-3 py-2.5 font-medium">Company</th>
              <th className="px-3 py-2.5 font-medium">Email</th>
              <th className="px-3 py-2.5 font-medium">Phone</th>
              <th className="px-3 py-2.5 font-medium">Stage</th>
              <th className="px-3 py-2.5 font-medium">Outreach</th>
              <th className="px-3 py-2.5 font-medium">Why</th>
              <th className="px-3 py-2.5 font-medium">Fit</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 9 : 10} className="px-3 py-8 text-center text-sm text-neutral-500">
                  No leads in this table.
                </td>
              </tr>
            ) : null}
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
                  {!readOnly && (
                    <td className="px-3 py-3 align-middle">
                      {showRowCheckboxes ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(contact.id)}
                          className="size-3.5 rounded border-neutral-300"
                          aria-label={`Select ${contact.full_name ?? "contact"}`}
                        />
                      ) : null}
                    </td>
                  )}
                  <td className="max-w-[200px] px-3 py-3 align-middle">
                    {onOpenProfile ? (
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-2.5 text-left font-medium text-neutral-900 hover:underline"
                        onClick={() => onOpenProfile({ contact, company })}
                      >
                        <ContactAvatar name={contact.full_name} linkedinUrl={contact.linkedin_url} email={contact.email} className="size-8" />
                        <span className="truncate">{contact.full_name || "—"}</span>
                      </button>
                    ) : (
                      <span className="flex min-w-0 items-center gap-2.5 font-medium text-neutral-900">
                        <ContactAvatar name={contact.full_name} linkedinUrl={contact.linkedin_url} email={contact.email} className="size-8" />
                        <span className="truncate">{contact.full_name || "—"}</span>
                      </span>
                    )}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-3 align-middle text-neutral-600">
                    {contact.title || "—"}
                  </td>
                  <td className="max-w-[180px] px-3 py-3 align-middle text-neutral-700">
                    <span className="flex min-w-0 items-center gap-2">
                      <CompanyFavicon domain={company.domain} name={company.name} />
                      <span className="truncate">{company.name}</span>
                    </span>
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
                    {readOnly ? (
                      <span className="text-[12px] capitalize text-neutral-700">{contact.lead_status}</span>
                    ) : (
                      <LeadStatusPicker contactId={contact.id} value={contact.lead_status} />
                    )}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    {readOnly ? (
                      <span className="text-[12px] text-neutral-700">
                        {OUTREACH_OPTIONS.find((option) => option.id === (contact.outreach ?? "not_contacted"))?.label}
                      </span>
                    ) : (
                      <OutreachPicker contactId={contact.id} value={(contact.outreach ?? "not_contacted") as OutreachState} />
                    )}
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
