"use client";

import Link from "next/link";
import type { CopilotArtifact } from "@/lib/agents/types";
import { CompanyFavicon } from "@/components/prospects/CompanyFavicon";
import { ContactAvatar } from "@/components/prospects/ContactAvatar";
import type { PresentedLead } from "@/lib/agents/present-leads";

function rowsOf(artifact: CopilotArtifact): PresentedLead[] {
  return Array.isArray(artifact.payload.rows) ? (artifact.payload.rows as PresentedLead[]) : [];
}

function Cell({ text, lines = 3 }: { text: string | null; lines?: number }) {
  if (!text) return <span className="text-neutral-400">—</span>;
  return (
    <span className={lines === 2 ? "line-clamp-2" : "line-clamp-3"} title={text}>
      {text}
    </span>
  );
}

/** Same table as Prospects, plus the context behind each lead: what the company does, why it was picked, the signal and an outreach angle. */
export function RunLeadsArtifact({ artifact }: { artifact: CopilotArtifact }) {
  const rows = rowsOf(artifact);
  const companies = new Set(rows.map((row) => row.domain || row.company)).size;

  return (
    <div className="flex flex-col gap-2 overflow-hidden rounded-[8px] border border-neutral-200 bg-white">
      <ul className="divide-y divide-neutral-100 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="px-3 py-3">
            <div className="flex items-start gap-2.5">
              <ContactAvatar name={row.name} linkedinUrl={row.linkedinUrl} email={row.email} className="size-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-900">{row.name || "—"}</span>
                <span className="mt-0.5 block truncate text-[13px] text-neutral-500">{row.title || "Role unknown"}</span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-neutral-600">
                  <CompanyFavicon domain={row.domain} name={row.company} />
                  <span className="truncate">{row.company}</span>
                </span>
                <span className="mt-1 block truncate text-[12px] text-neutral-500">{row.email || "No email"}</span>
              </span>
            </div>
            {row.description ? <p className="mt-2 text-[12px] leading-snug text-neutral-500">{row.description}</p> : null}
            {row.reason ? <p className="mt-1.5 text-[12px] leading-snug text-neutral-700"><span className="text-neutral-400">Why: </span>{row.reason}</p> : null}
            {row.angle ? <p className="mt-1.5 text-[12px] leading-snug text-neutral-700"><span className="text-neutral-400">Angle: </span>{row.angle}</p> : null}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] border-collapse text-sm leading-tight">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-[11px] font-medium uppercase tracking-wide text-neutral-400">
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Title</th>
              <th className="px-3 py-2.5 font-medium">Company</th>
              <th className="px-3 py-2.5 font-medium">What they do</th>
              <th className="px-3 py-2.5 font-medium">Email</th>
              <th className="px-3 py-2.5 font-medium">Why this lead</th>
              <th className="px-3 py-2.5 font-medium">Outreach angle</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-neutral-500">
                  No leads in this table.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-neutral-100 align-top transition-colors last:border-b-0 hover:bg-neutral-100/60">
                <td className="max-w-[200px] px-3 py-3">
                  <span className="flex min-w-0 items-center gap-2.5 font-medium text-neutral-900">
                    <ContactAvatar name={row.name} linkedinUrl={row.linkedinUrl} email={row.email} className="size-8" />
                    <span className="truncate">{row.name || "—"}</span>
                  </span>
                </td>
                <td className="max-w-[160px] px-3 py-3 text-neutral-600">
                  <Cell text={row.title} lines={2} />
                </td>
                <td className="max-w-[170px] px-3 py-3 text-neutral-700">
                  <span className="flex min-w-0 items-center gap-2">
                    <CompanyFavicon domain={row.domain} name={row.company} />
                    <span className="truncate">{row.company}</span>
                  </span>
                </td>
                <td className="w-[220px] min-w-[200px] px-3 py-3 text-[13px] leading-snug text-neutral-600">
                  <Cell text={row.description} />
                </td>
                <td className="max-w-[200px] truncate px-3 py-3 text-neutral-600">
                  {row.email ? (
                    <span>
                      {row.email}
                      {row.emailStatus && row.emailStatus !== "unverified" ? (
                        <span className="ml-1 text-[11px] text-neutral-400">{row.emailStatus}</span>
                      ) : null}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="w-[240px] min-w-[220px] px-3 py-3 text-[13px] leading-snug text-neutral-600">
                  <Cell text={row.reason} />
                  {row.signal ? <span className="mt-1 line-clamp-2 block text-[12px] text-neutral-400" title={row.signal}>{row.signal}</span> : null}
                </td>
                <td className="w-[260px] min-w-[220px] px-3 py-3 text-[13px] leading-snug text-neutral-700">
                  <Cell text={row.angle} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 pb-2">
        <p className="text-[11px] text-neutral-400">
          {rows.length} contact{rows.length === 1 ? "" : "s"} · {companies} compan{companies === 1 ? "y" : "ies"}
        </p>
        <Link href="/dashboard/prospects" className="text-[12px] font-medium text-neutral-700 underline-offset-2 hover:underline">
          Open in Prospects
        </Link>
      </div>
    </div>
  );
}
