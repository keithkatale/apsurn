"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { matchesOutreachTab, OUTREACH_OPTIONS, type OutreachState, type ProspectRow } from "@/components/prospects/types";

type LeftPanelMode = "idle" | "form" | "structured-run" | "chat";

export function ProspectsWorkspace({
  initialCompanies,
  openFind = false,
}: {
  initialCompanies: ProspectRow[];
  openFind?: boolean;
}) {
  const [companies, setCompanies] = useState<ProspectRow[]>(initialCompanies);
  const [panelOpen, setPanelOpen] = useState(openFind);
  const [leftMode, setLeftMode] = useState<LeftPanelMode>(openFind ? "form" : "idle");
  const [activeCriteria, setActiveCriteria] = useState<ProspectSearchCriteria | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [profileIds, setProfileIds] = useState<{ contactId: string; companyId: string } | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [tableTab, setTableTab] = useState<string>("all");

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
  const lists = useMemo(() => {
    const seen = new Map<string, string>();
    for (const company of active) {
      if (company.list_id && !seen.has(company.list_id)) seen.set(company.list_id, company.list_name || "List");
    }
    return [...seen.entries()].map(([id, label]) => ({ id: `list:${id}`, label }));
  }, [active]);

  const tableTabs = useMemo(
    () => [{ id: "all", label: "All leads" }, ...OUTREACH_OPTIONS.map((option) => ({ id: option.id, label: option.label })), ...lists],
    [lists],
  );

  const qualified = useMemo(() => {
    const listId = tableTab.startsWith("list:") ? tableTab.slice(5) : null;
    const outreachTab = OUTREACH_OPTIONS.some((option) => option.id === tableTab) ? (tableTab as OutreachState) : null;
    return active
      .filter((p) => p.status !== "rejected" && matchesQuery(p) && (!listId || p.list_id === listId))
      .map((p) => ({
        ...p,
        contacts: p.contacts.filter((c) => {
          if (outreachTab && !matchesOutreachTab(c, outreachTab)) return false;
          return true;
        }),
      }))
      .filter((p) => p.contacts.length > 0);
  }, [active, matchesQuery, tableTab]);

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

  useEffect(() => {
    if (openFind) openPanel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once from query
  }, [openFind]);

  return (
    <div className="flex h-full overflow-hidden bg-white">
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
        <div className="flex flex-col gap-3 px-1 py-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex shrink-0 items-center gap-2">
              <p className="text-sm text-neutral-500">
                apsurn <span className="px-1 text-neutral-300">/</span>
                <span className="font-semibold text-neutral-900">Prospects</span>
              </p>
              {searchOpen ? (
                <input
                  autoFocus
                  className="input w-44 py-1.5"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onBlur={() => {
                    if (!search.trim()) setSearchOpen(false);
                  }}
                />
              ) : (
                <button
                  type="button"
                  aria-label="Search prospects"
                  onClick={() => setSearchOpen(true)}
                  className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                >
                  <Search className="size-4" />
                </button>
              )}
            </div>
            {active.length > 0 ? (
              <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
                {tableTabs.map((tab) => {
                  const activeTab = tableTab === tab.id;
                  const tone =
                    tab.id === "in_campaign"
                      ? activeTab
                        ? "bg-[#E8F1FC] text-[#4379EE]"
                        : "text-[#4379EE] hover:bg-[#E8F1FC]"
                      : tab.id === "contacted"
                        ? activeTab
                          ? "bg-emerald-50 text-emerald-700"
                          : "text-emerald-700 hover:bg-emerald-50"
                        : tab.id === "not_contacted"
                          ? activeTab
                            ? "bg-amber-50 text-amber-800"
                            : "text-amber-800 hover:bg-amber-50"
                          : tab.id === "not_in_campaign"
                            ? activeTab
                              ? "bg-neutral-200 text-neutral-800"
                              : "text-neutral-600 hover:bg-neutral-100"
                            : activeTab
                              ? "bg-neutral-900 text-white"
                              : "text-neutral-600 hover:bg-neutral-100";
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setTableTab(tab.id)}
                      className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-medium ${tone}`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {selected.size > 0 ? (
                <BulkActionBar
                  selectedContactIds={[...selected]}
                  contacts={allContacts}
                  prospects={qualified}
                  onCleared={() => setSelected(new Set())}
                />
              ) : (
                <>
                  <WeeklyScheduleForm />
                  <ThreeDButton type="button" variant="solid" size="sm" onClick={openPanel}>
                    <PanelLeftOpen className="size-4" />
                    <span>Find prospects</span>
                  </ThreeDButton>
                </>
              )}
            </div>
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
              {qualified.length === 0 ? (
                <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center">
                  <p className="text-sm text-neutral-500">No prospects match your search or filters.</p>
                </div>
              ) : null}

              <ContactsTable
                prospects={qualified}
                selected={selected}
                onSelectedChange={setSelected}
                onOpenProfile={(row) => setProfileIds({ contactId: row.contact.id, companyId: row.company.id })}
              />
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
