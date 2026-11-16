"use client";

import { useMemo } from "react";
import { CompanyFavicon } from "./CompanyFavicon";
import type { ContactRow, ProspectRow } from "./types";

export type FlatRow = {
  contact: ContactRow;
  company: ProspectRow;
};

function textCell(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return <span className="text-neutral-300 dark:text-neutral-600">—</span>;
  return (
    <span className="line-clamp-2" title={text}>
      {text}
    </span>
  );
}

function FounderCell({ person }: { person: ContactRow | undefined }) {
  if (!person?.full_name && !person?.title && !person?.linkedin_url) return <span className="text-neutral-300 dark:text-neutral-600">—</span>;
  return (
    <span className="block min-w-[140px]">
      <span className="block truncate font-medium text-neutral-900 dark:text-neutral-100">{person.full_name || "—"}</span>
      {person.title ? <span className="block truncate text-[12px] text-neutral-500 dark:text-neutral-400">{person.title}</span> : null}
      {person.linkedin_url ? (
        <a
          href={person.linkedin_url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-[12px] text-neutral-500 underline dark:text-neutral-400"
          onClick={(event) => event.stopPropagation()}
        >
          LinkedIn
        </a>
      ) : null}
    </span>
  );
}

function otherFounders(people: ContactRow[]): string | null {
  const rest = people.slice(2).filter((person) => person.full_name);
  if (rest.length === 0) return null;
  return rest.map((person) => (person.title ? `${person.full_name} (${person.title})` : person.full_name)).join("; ");
}

function hiringLabel(hiring: boolean | null | undefined): string | null {
  if (hiring === true) return "Yes";
  if (hiring === false) return "No";
  return null;
}

export function ContactsTable({
  prospects,
  selected,
  onOpenProfile,
  lists,
  onMoveToList,
}: {
  prospects: ProspectRow[];
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  onOpenProfile?: (row: FlatRow) => void;
  readOnly?: boolean;
  maskEmails?: boolean;
  lists?: Array<{ id: string; name: string }>;
  onMoveToList?: (companyId: string, listId: string) => void;
}) {
  const rows = useMemo(() => prospects, [prospects]);
  const showList = Boolean(lists && onMoveToList);

  return (
    <div className="flex flex-col gap-2 overflow-hidden rounded-[8px] border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-[#121212]">
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 md:hidden">
        {rows.length === 0 ? <li className="px-3 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">No companies in this list.</li> : null}
        {rows.map((company) => {
          const founder = company.contacts[0];
          const isSelected = company.contacts.some((contact) => selected.has(contact.id));
          return (
            <li key={company.id} className={isSelected ? "bg-neutral-100 dark:bg-neutral-800" : undefined}>
              <button
                type="button"
                className="flex w-full items-start gap-2.5 px-3 py-3 text-left disabled:cursor-default"
                onClick={() => founder && onOpenProfile?.({ contact: founder, company })}
                disabled={!onOpenProfile || !founder}
              >
                <CompanyFavicon domain={company.domain} name={company.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{company.name}</span>
                  {company.description ? <span className="mt-0.5 line-clamp-2 block text-[12px] text-neutral-500 dark:text-neutral-400">{company.description}</span> : null}
                  <span className="mt-1 block truncate text-[12px] text-neutral-400 dark:text-neutral-500">
                    {[company.location, hiringLabel(company.hiring) ? `Hiring: ${hiringLabel(company.hiring)}` : null].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1400px] border-collapse text-sm leading-tight">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
              <th className="px-3 py-2.5 font-medium">Company</th>
              <th className="px-3 py-2.5 font-medium">What they do</th>
              <th className="px-3 py-2.5 font-medium">Their buyer</th>
              <th className="px-3 py-2.5 font-medium">Key insight</th>
              <th className="px-3 py-2.5 font-medium">Outreach angle</th>
              <th className="px-3 py-2.5 font-medium">Founder 1</th>
              <th className="px-3 py-2.5 font-medium">Founder 2</th>
              <th className="px-3 py-2.5 font-medium">Other founders</th>
              <th className="px-3 py-2.5 font-medium">Team size</th>
              <th className="px-3 py-2.5 font-medium">Location</th>
              <th className="px-3 py-2.5 font-medium">Hiring</th>
              <th className="px-3 py-2.5 font-medium">Website</th>
              <th className="px-3 py-2.5 font-medium">Source page</th>
              {showList ? <th className="px-3 py-2.5 font-medium">List</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={showList ? 14 : 13} className="px-3 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  No companies in this list.
                </td>
              </tr>
            ) : null}
            {rows.map((company) => {
              const founder = company.contacts[0];
              const isSelected = company.contacts.some((contact) => selected.has(contact.id));
              const website = company.website_url || (company.domain ? `https://${company.domain}` : null);
              return (
                <tr
                  key={company.id}
                  className={`border-b border-neutral-100 transition-colors last:border-b-0 hover:bg-neutral-100/60 dark:border-neutral-800/80 dark:hover:bg-neutral-800/50 ${isSelected ? "bg-neutral-100 dark:bg-neutral-800" : ""}`}
                >
                  <td className="max-w-[200px] px-3 py-3 align-top">
                    {onOpenProfile && founder ? (
                      <button
                        type="button"
                        className="flex min-w-0 items-center gap-2 text-left font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                        onClick={() => onOpenProfile({ contact: founder, company })}
                      >
                        <CompanyFavicon domain={company.domain} name={company.name} />
                        <span className="truncate">{company.name}</span>
                      </button>
                    ) : (
                      <span className="flex min-w-0 items-center gap-2 font-medium text-neutral-900 dark:text-neutral-100">
                        <CompanyFavicon domain={company.domain} name={company.name} />
                        <span className="truncate">{company.name}</span>
                      </span>
                    )}
                  </td>
                  <td className="max-w-[240px] px-3 py-3 align-top text-[13px] text-neutral-600 dark:text-neutral-400">{textCell(company.description)}</td>
                  <td className="max-w-[180px] px-3 py-3 align-top text-[13px] text-neutral-600 dark:text-neutral-400">{textCell(company.their_buyer)}</td>
                  <td className="max-w-[220px] px-3 py-3 align-top text-[13px] text-neutral-600 dark:text-neutral-400">{textCell(company.key_insight)}</td>
                  <td className="max-w-[220px] px-3 py-3 align-top text-[13px] text-neutral-600 dark:text-neutral-400">{textCell(company.outreach_angle)}</td>
                  <td className="px-3 py-3 align-top">
                    <FounderCell person={company.contacts[0]} />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <FounderCell person={company.contacts[1]} />
                  </td>
                  <td className="max-w-[200px] px-3 py-3 align-top text-[13px] text-neutral-600 dark:text-neutral-400">{textCell(otherFounders(company.contacts))}</td>
                  <td className="whitespace-nowrap px-3 py-3 align-top text-neutral-600 dark:text-neutral-400">{company.employee_range || "—"}</td>
                  <td className="max-w-[160px] px-3 py-3 align-top text-neutral-600 dark:text-neutral-400">{textCell(company.location)}</td>
                  <td className="whitespace-nowrap px-3 py-3 align-top text-neutral-600 dark:text-neutral-400">{hiringLabel(company.hiring) ?? "—"}</td>
                  <td className="max-w-[160px] px-3 py-3 align-top text-[13px]">
                    {website ? (
                      <a href={website} target="_blank" rel="noreferrer" className="block truncate text-neutral-700 underline dark:text-neutral-300">
                        {company.domain || website}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-[160px] px-3 py-3 align-top text-[13px]">
                    {company.source_url ? (
                      <a href={company.source_url} target="_blank" rel="noreferrer" className="block truncate text-neutral-700 underline dark:text-neutral-300">
                        Source
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  {showList && lists && onMoveToList ? (
                    <td className="px-3 py-3 align-top">
                      <select
                        aria-label="Move to list"
                        value={company.list_id ?? ""}
                        onChange={(event) => event.target.value && onMoveToList(company.id, event.target.value)}
                        className="max-w-[150px] rounded-md border border-neutral-200 bg-transparent px-1.5 py-1 text-[12px] text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-3 pb-2 text-[11px] text-neutral-400 dark:text-neutral-500">
        {rows.length} compan{rows.length === 1 ? "y" : "ies"}
      </p>
    </div>
  );
}
