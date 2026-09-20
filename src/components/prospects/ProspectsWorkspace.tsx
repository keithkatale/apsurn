"use client";

import { useCallback, useMemo, useState } from "react";
import { PanelLeftOpen, Search, X } from "lucide-react";
import { ThreeDButton } from "@/components/buttons/three-d-button";
import { BulkActionBar } from "@/components/prospects/BulkActionBar";
import { ContactProfilePanel } from "@/components/prospects/ContactProfilePanel";
import { ContactsTable, type FlatRow } from "@/components/prospects/ContactsTable";
import { NewProspectingRun } from "@/components/prospects/NewProspectingRun";
import { ProspectChatPanel } from "@/components/prospects/ProspectChatPanel";
import type { ProspectSearchCriteria } from "@/components/prospects/ProspectComposeModal";
import { ProspectPlanPanel } from "@/components/prospects/ProspectPlanPanel";
import { WeeklyScheduleForm } from "@/components/prospects/WeeklyScheduleForm";
import { LEAD_STATUSES, type LeadStatus, type ProspectRow } from "@/components/prospects/types";

type LeftPanelMode = "idle" | "form" | "structured-run" | "chat";

export function ProspectsWorkspace({ initialCompanies }: { initialCompanies: ProspectRow[] }) {
  const [companies, setCompanies] = useState<ProspectRow[]>(initialCompanies);
  const [panelOpen, setPanelOpen] = useState(false);
  const [leftMode, setLeftMode] = useState<LeftPanelMode>("idle");
  const [activeCriteria, setActiveCriteria] = useState<ProspectSearchCriteria | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [profileIds, setProfileIds] = useState<{ contactId: string; companyId: string } | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<LeadStatus | "all">("all");

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/prospect-companies");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.companies)) setCompanies(data.companies as ProspectRow[]);
    } catch {
      // best-effort; the next event will retry
    }
  }, []);

  const active = companies.filter((p) => !p.archived_at);

  const query = search.trim().toLowerCase();
  const matchesQuery = useCallback(
    (p: ProspectRow) =>
      !query ||
      p.name.toLowerCase().includes(query) ||
      p.domain.toLowerCase().includes(query) ||
      p.contacts.some((c) => c.full_name?.toLowerCase().includes(query)),
    [query]
  );

  // Every prospecting run saves a company straight in — there is no manual
  // approval step to wait for any more, so "new" (rows saved before this
  // change, or by anything else that still writes that default) is treated
  // exactly like "qualified". Only an explicit past "rejected" stays hidden,
  // since that was a deliberate action, not a pending one.
  const qualified = useMemo(() => {
    return active
      .filter((p) => p.status !== "rejected" && matchesQuery(p))
      .map((p) => ({
        ...p,
        contacts: stageFilter === "all" ? p.contacts : p.contacts.filter((c) => c.lead_status === stageFilter),
      }))
      .filter((p) => p.contacts.length > 0);
  }, [active, matchesQuery, stageFilter]);

  const allContacts = useMemo(() => qualified.flatMap((p) => p.contacts), [qualified]);

  const profileRow: FlatRow | null = useMemo(() => {
    if (!profileIds) return null;
    const company = companies.find((c) => c.id === profileIds.companyId);
    const contact = company?.contacts.find((c) => c.id === profileIds.contactId);
    if (!company || !contact) return null;
    return { contact, company };
  }, [companies, profileIds]);

  function openPanel() {
    if (leftMode === "idle") setLeftMode("form");
    setPanelOpen(true);
  }

  return (
    <div className="-m-8 flex h-[calc(100%+4rem)] overflow-hidden bg-white">
      <div
        className={`shrink-0 overflow-hidden border-r border-neutral-200 bg-white transition-[width] duration-300 ease-out ${
          panelOpen ? "w-[420px]" : "w-0"
        }`}
      >
        <div className="relative flex h-full w-[420px] flex-col">
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            aria-label="Collapse panel"
            className="absolute right-3 top-3 z-10 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X className="size-4" />
          </button>

          {leftMode === "form" ? (
            <ProspectPlanPanel
              onApprove={(criteria) => {
                setActiveCriteria(criteria);
                setLeftMode("structured-run");
              }}
              onTalkToAi={() => setLeftMode("chat")}
            />
          ) : leftMode === "structured-run" && activeCriteria ? (
            <NewProspectingRun criteria={activeCriteria} onLeadSaved={refetch} onRunFinished={refetch} />
          ) : leftMode === "chat" ? (
            <ProspectChatPanel onLeadSaved={refetch} onRunFinished={refetch} />
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-neutral-900">Prospects</h1>
              <p className="text-sm text-neutral-500">
                {active.length > 0 ? `${active.length} compan${active.length === 1 ? "y" : "ies"}` : "No prospects yet"}
              </p>
            </div>

            {selected.size > 0 ? (
              <BulkActionBar
                selectedContactIds={[...selected]}
                contacts={allContacts}
                prospects={qualified}
                onCleared={() => setSelected(new Set())}
              />
            ) : (
              <div className="flex items-center gap-2">
                <WeeklyScheduleForm />
                <ThreeDButton type="button" variant="solid" size="sm" onClick={openPanel}>
                  <PanelLeftOpen className="size-4" />
                  <span>Find prospects</span>
                </ThreeDButton>
              </div>
            )}
          </div>

          {active.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-10 text-center">
              <p className="font-medium text-neutral-900">No prospects have been generated yet</p>
              <p className="mt-1 text-sm text-neutral-500">
                Click &ldquo;Find prospects&rdquo; above to build your first list of companies and contacts.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-400" />
                  <input
                    className="input w-full"
                    style={{ paddingLeft: "2rem" }}
                    placeholder="Search by name or company…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  className="input w-auto"
                  value={stageFilter}
                  onChange={(e) => setStageFilter(e.target.value as LeadStatus | "all")}
                >
                  <option value="all">All stages</option>
                  {LEAD_STATUSES.map((status) => (
                    <option key={status} value={status} className="capitalize">
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              {qualified.length === 0 ? (
                <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
                  <p className="text-sm text-neutral-500">No prospects match your search or filters.</p>
                </div>
              ) : null}

              {qualified.length > 0 && (
                <ContactsTable
                  prospects={qualified}
                  selected={selected}
                  onSelectedChange={setSelected}
                  onOpenProfile={(row) => setProfileIds({ contactId: row.contact.id, companyId: row.company.id })}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className={`shrink-0 overflow-hidden border-l border-neutral-200 bg-white transition-[width] duration-300 ease-out ${
          profileRow ? "w-[420px]" : "w-0"
        }`}
      >
        <div className="h-full w-[420px]">
          {profileRow && (
            <ContactProfilePanel
              contact={profileRow.contact}
              company={profileRow.company}
              onClose={() => setProfileIds(null)}
              onSaved={refetch}
            />
          )}
        </div>
      </div>
    </div>
  );
}
