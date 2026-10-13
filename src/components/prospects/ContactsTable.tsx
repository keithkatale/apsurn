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
  onOpenProfile,
  readOnly = false,
  maskEmails = false,
  lists,
  onMoveToList,
}: {
  prospects: ProspectRow[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  onOpenProfile?: (row: FlatRow) => void;
  readOnly?: boolean;
  maskEmails?: boolean;
  /** When given, each row gets a picker to file its company in one of these lists. */
  lists?: Array<{ id: string; name: string }>;
  onMoveToList?: (companyId: string, listId: string) => void;
}) {
  const rows = useMemo<FlatRow[]>(
    () =>
      prospects.flatMap((company) =>
        company.contacts.map((contact) => ({ contact, company })),
      ),
    [prospects],
  );

  return (
    <div className="flex flex-col gap-2 overflow-hidden rounded-[8px] border border-neutral-200 bg-white">
      <ul className="divide-y divide-neutral-100 md:hidden">
        {rows.length === 0 ? (
          <li className="px-3 py-8 text-center text-sm text-neutral-500">No leads in this table.</li>
        ) : null}
        {rows.map(({ contact, company }) => {
          const isSelected = selected.has(contact.id);
          return (
            <li key={contact.id} className={isSelected ? "bg-neutral-100" : undefined}>
              <div className="flex items-start gap-3 px-3 py-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-2.5 text-left disabled:cursor-default"
                  onClick={() => onOpenProfile?.({ contact, company })}
                  disabled={!onOpenProfile}
                >
                  <ContactAvatar name={contact.full_name} linkedinUrl={contact.linkedin_url} email={contact.email} photoUrl={contact.photo_url} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900">{contact.full_name || "—"}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-neutral-500">{contact.title || "Role unknown"}</span>
                    <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-neutral-600">
                      <CompanyFavicon domain={company.domain} name={company.name} />
                      <span className="truncate">{company.name}</span>
                    </span>
                    {readOnly ? (
                      <>
                        {company.description ? (
                          <span className="mt-1 line-clamp-2 block text-[12px] leading-snug text-neutral-500">{company.description}</span>
                        ) : null}
                        {company.country || contact.country ? (
                          <span className="mt-1 block truncate text-[12px] text-neutral-400">{contact.country || company.country}</span>
                        ) : null}
                      </>
                    ) : (
                      <span className="mt-1 block truncate text-[12px] text-neutral-500">
                        {maskEmails ? "Email hidden" : contact.email || "No email"}
                      </span>
                    )}
                  </span>
                </button>
              </div>
              {!readOnly ? (
                <div className="flex flex-wrap gap-2 px-3 pb-3">
                  <LeadStatusPicker contactId={contact.id} value={contact.lead_status} />
                  <OutreachPicker contactId={contact.id} value={(contact.outreach ?? "not_contacted") as OutreachState} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm leading-tight">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Title</th>
              <th className="px-3 py-2.5 font-medium">Company</th>
              {readOnly ? (
                <>
                  <th className="px-3 py-2.5 font-medium">Description</th>
                  <th className="px-3 py-2.5 font-medium">Country</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2.5 font-medium">Email</th>
                  <th className="px-3 py-2.5 font-medium">Why</th>
                  <th className="px-3 py-2.5 font-medium">Fit</th>
                  <th className="px-3 py-2.5 font-medium">Outreach</th>
                  {lists && onMoveToList ? <th className="px-3 py-2.5 font-medium">List</th> : null}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 5 : lists ? 8 : 7} className="px-3 py-8 text-center text-sm text-neutral-500">
                  No leads in this table.
                </td>
              </tr>
            ) : null}
            {rows.map(({ contact, company }) => {
              const isSelected = selected.has(contact.id);
              return (
                <tr
                  key={contact.id}
                  className={`border-b border-neutral-100 transition-colors last:border-b-0 hover:bg-neutral-100/60 ${isSelected ? "bg-neutral-100" : ""}`}
                >
                  <td className="max-w-[200px] px-3 py-3 align-middle">
                    {onOpenProfile ? (
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-2.5 text-left font-medium text-neutral-900 hover:underline"
                        onClick={() => onOpenProfile({ contact, company })}
                      >
                        <ContactAvatar name={contact.full_name} linkedinUrl={contact.linkedin_url} email={contact.email} photoUrl={contact.photo_url} className="size-8" />
                        <span className="truncate">{contact.full_name || "—"}</span>
                      </button>
                    ) : (
                      <span className="flex min-w-0 items-center gap-2.5 font-medium text-neutral-900">
                        <ContactAvatar name={contact.full_name} linkedinUrl={contact.linkedin_url} email={contact.email} photoUrl={contact.photo_url} className="size-8" />
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
                  {readOnly ? (
                    <>
                      <td className="max-w-[320px] px-3 py-3 align-middle text-[13px] leading-snug text-neutral-600">
                        {company.description ? (
                          <span className="line-clamp-2" title={company.description}>
                            {company.description}
                          </span>
                        ) : maskEmails ? (
                          // Still being read from the company's site while the search continues.
                          <span className="block h-3 w-40 animate-pulse rounded bg-neutral-100" aria-label="Loading description" />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 align-middle text-neutral-600">
                        {contact.country || company.country || "—"}
                      </td>
                    </>
                  ) : (
                    <>
                  <td className="max-w-[200px] truncate px-3 py-3 align-middle text-neutral-600">
                    {maskEmails ? (
                      <span className="inline-block select-none blur-[5px]" aria-hidden>
                        {contact.email || "name@company.com"}
                      </span>
                    ) : contact.email ? (
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
                  <td
                    className="max-w-[200px] truncate px-3 py-3 align-middle text-neutral-500"
                    title={contact.qualify_reason ?? undefined}
                  >
                    {contact.qualify_reason || "—"}
                  </td>
                  <td className="px-3 py-3 align-middle tabular-nums text-neutral-600">
                    {company.icp_fit_score ?? "—"}
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
                  {lists && onMoveToList ? (
                    <td className="px-3 py-3 align-middle">
                      <select
                        aria-label="Move to list"
                        value={company.list_id ?? ""}
                        onChange={(event) => event.target.value && onMoveToList(company.id, event.target.value)}
                        className="max-w-[150px] rounded-md border border-neutral-200 bg-transparent px-1.5 py-1 text-[12px] text-neutral-700"
                      >
                        {!company.list_id ? <option value="">No list</option> : null}
                        {lists.map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  ) : null}
                    </>
                  )}
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
